import { describe, it, expect } from 'vitest';
import { validateReturnTo } from './auth';

describe('validateReturnTo', () => {
  const fallback = '/';

  // ── Valid relative paths ──────────────────────────────────────────────────
  it('allows simple relative paths', () => {
    expect(validateReturnTo('/dashboard', fallback)).toBe('/dashboard');
    expect(validateReturnTo('/recipes/123', fallback)).toBe('/recipes/123');
    expect(validateReturnTo('/search?q=pasta', fallback)).toBe('/search?q=pasta');
  });

  it('allows root path', () => {
    expect(validateReturnTo('/', fallback)).toBe('/');
  });

  // ── Valid deep links ──────────────────────────────────────────────────────
  it('allows reducedrecipes:// deep links', () => {
    expect(validateReturnTo('reducedrecipes://auth/callback', fallback)).toBe(
      'reducedrecipes://auth/callback',
    );
    expect(validateReturnTo('reducedrecipes://recipes/123', fallback)).toBe(
      'reducedrecipes://recipes/123',
    );
  });

  // ── Fallback on empty / missing ────────────────────────────────────────────
  it('returns fallback for empty string', () => {
    expect(validateReturnTo('', fallback)).toBe(fallback);
  });

  // ── Blocked: absolute URLs ─────────────────────────────────────────────────
  it('rejects http:// URLs', () => {
    expect(validateReturnTo('http://evil.com', fallback)).toBe(fallback);
  });

  it('rejects https:// URLs', () => {
    expect(validateReturnTo('https://evil.com/steal?token=abc', fallback)).toBe(fallback);
  });

  // ── Blocked: protocol-relative ─────────────────────────────────────────────
  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(validateReturnTo('//evil.com', fallback)).toBe(fallback);
    expect(validateReturnTo('//evil.com/path', fallback)).toBe(fallback);
  });

  // ── Blocked: dangerous schemes ─────────────────────────────────────────────
  it('rejects javascript: URIs', () => {
    expect(validateReturnTo('javascript:alert(1)', fallback)).toBe(fallback);
  });

  it('rejects data: URIs', () => {
    expect(validateReturnTo('data:text/html,<script>alert(1)</script>', fallback)).toBe(fallback);
  });

  // ── Blocked: path traversal tricks ─────────────────────────────────────────
  it('rejects backslash tricks in path', () => {
    expect(validateReturnTo('/\\evil.com', fallback)).toBe(fallback);
  });

  it('rejects encoded backslash tricks', () => {
    expect(validateReturnTo('/%5Cevil.com', fallback)).toBe(fallback);
  });

  // ── Custom fallbacks ──────────────────────────────────────────────────────
  it('uses provided fallback for mobile', () => {
    const mobileFallback = 'reducedrecipes://auth/callback';
    expect(validateReturnTo('https://evil.com', mobileFallback)).toBe(mobileFallback);
    expect(validateReturnTo('', mobileFallback)).toBe(mobileFallback);
  });
});
