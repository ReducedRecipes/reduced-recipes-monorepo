import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  verifyState,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  extractUserInfo,
} from '../google-oauth';

// ── Tests ────────────────────────────────────────────────────────────────

describe('google-oauth helpers', () => {
  describe('generateCodeVerifier', () => {
    it('returns a string between 43 and 128 characters', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('uses only base64url characters', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('generates unique values on each call', () => {
      const a = generateCodeVerifier();
      const b = generateCodeVerifier();
      expect(a).not.toBe(b);
    });
  });

  describe('generateCodeChallenge', () => {
    it('returns a base64url-encoded SHA-256 hash', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = await generateCodeChallenge(verifier);
      // S256 challenge should be base64url without padding
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
      expect(challenge.length).toBeGreaterThan(0);
    });

    it('produces consistent output for the same input', async () => {
      const verifier = 'test-verifier-123';
      const a = await generateCodeChallenge(verifier);
      const b = await generateCodeChallenge(verifier);
      expect(a).toBe(b);
    });

    it('produces different output for different inputs', async () => {
      const a = await generateCodeChallenge('verifier-a');
      const b = await generateCodeChallenge('verifier-b');
      expect(a).not.toBe(b);
    });
  });

  describe('generateState / verifyState', () => {
    const secret = 'test-session-secret-abc123';

    it('generates a state in {nonce}.{signature} format', async () => {
      const state = await generateState(secret);
      const parts = state.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // UUID without dashes
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it('verifies a valid state', async () => {
      const state = await generateState(secret);
      const valid = await verifyState(state, secret);
      expect(valid).toBe(true);
    });

    it('rejects state with wrong secret', async () => {
      const state = await generateState(secret);
      const valid = await verifyState(state, 'wrong-secret');
      expect(valid).toBe(false);
    });

    it('rejects tampered nonce', async () => {
      const state = await generateState(secret);
      const [, sig] = state.split('.');
      const tampered = `tamperednonce12345678901234567890.${sig}`;
      const valid = await verifyState(tampered, secret);
      expect(valid).toBe(false);
    });

    it('rejects state without dot separator', async () => {
      const valid = await verifyState('nodothere', secret);
      expect(valid).toBe(false);
    });

    it('generates unique states each time', async () => {
      const a = await generateState(secret);
      const b = await generateState(secret);
      expect(a).not.toBe(b);
    });
  });

  describe('buildGoogleAuthUrl', () => {
    it('returns a valid Google OAuth URL with all required params', () => {
      const url = buildGoogleAuthUrl({
        clientId: 'test-client-id',
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'test-challenge',
        state: 'test-state',
      });

      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://accounts.google.com');
      expect(parsed.pathname).toBe('/o/oauth2/v2/auth');
      expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://example.com/callback',
      );
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('scope')).toBe('openid email profile');
      expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge');
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
      expect(parsed.searchParams.get('state')).toBe('test-state');
      expect(parsed.searchParams.get('access_type')).toBe('online');
      expect(parsed.searchParams.get('prompt')).toBe('consent');
    });
  });

  describe('exchangeCodeForTokens', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('sends correct POST request to Google token endpoint', async () => {
      const mockResponse = {
        access_token: 'ya29.mock-access-token',
        id_token: 'mock.id.token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(mockResponse)));

      const result = await exchangeCodeForTokens(
        'auth-code-123',
        'code-verifier-456',
        'client-id',
        'client-secret',
        'https://example.com/callback',
      );

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://oauth2.googleapis.com/token');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({
        'Content-Type': 'application/x-www-form-urlencoded',
      });

      const body = new URLSearchParams(options?.body as string);
      expect(body.get('code')).toBe('auth-code-123');
      expect(body.get('code_verifier')).toBe('code-verifier-456');
      expect(body.get('client_id')).toBe('client-id');
      expect(body.get('client_secret')).toBe('client-secret');
      expect(body.get('redirect_uri')).toBe('https://example.com/callback');
      expect(body.get('grant_type')).toBe('authorization_code');

      expect(result).toEqual(mockResponse);
    });

    it('throws on non-OK response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{"error":"invalid_grant"}', { status: 400 }),
      );

      await expect(
        exchangeCodeForTokens(
          'bad-code',
          'verifier',
          'client-id',
          'client-secret',
          'https://example.com/callback',
        ),
      ).rejects.toThrow('Google token exchange failed (400)');
    });
  });

  describe('extractUserInfo', () => {
    function makeJwt(payload: Record<string, unknown>): string {
      const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const body = btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return `${header}.${body}.fake-signature`;
    }

    it('extracts user info from a valid JWT id_token', () => {
      const token = makeJwt({
        sub: '1234567890',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
        iss: 'accounts.google.com',
      });

      const info = extractUserInfo(token);
      expect(info).toEqual({
        sub: '1234567890',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      });
    });

    it('defaults name and picture to empty string if missing', () => {
      const token = makeJwt({
        sub: '999',
        email: 'minimal@example.com',
      });

      const info = extractUserInfo(token);
      expect(info.name).toBe('');
      expect(info.picture).toBe('');
    });

    it('throws on invalid JWT format (not 3 parts)', () => {
      expect(() => extractUserInfo('not.a.valid.jwt.token')).toThrow(
        'Invalid JWT: expected 3 parts',
      );
      expect(() => extractUserInfo('onlyonepart')).toThrow(
        'Invalid JWT: expected 3 parts',
      );
    });

    it('throws if sub or email is missing from payload', () => {
      const token = makeJwt({ name: 'No Sub Or Email' });
      expect(() => extractUserInfo(token)).toThrow(
        'Invalid JWT payload: missing sub or email',
      );
    });
  });
});
