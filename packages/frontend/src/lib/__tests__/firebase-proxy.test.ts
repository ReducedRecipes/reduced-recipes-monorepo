import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxyToFirebaseAuth } from '../firebase-proxy';

describe('proxyToFirebaseAuth', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
  });

  it('rewrites the hostname to the Firebase project domain and preserves path + query', async () => {
    const req = new Request('https://reduced.recipes/__/auth/iframe?apiKey=abc&v=1');
    await proxyToFirebaseAuth(req);
    const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toBe(
      'https://reducedrecipes.firebaseapp.com/__/auth/iframe?apiKey=abc&v=1',
    );
  });

  it('forwards the method and POST body', async () => {
    const req = new Request('https://reduced.recipes/__/auth/handler', {
      method: 'POST',
      body: 'code=xyz',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    await proxyToFirebaseAuth(req);
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeDefined();
  });

  it('omits the body on GET so fetch does not reject', async () => {
    const req = new Request('https://reduced.recipes/__/auth/handler');
    await proxyToFirebaseAuth(req);
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(init.body).toBeNull();
  });

  it('does not follow upstream redirects so the browser drives the flow', async () => {
    const req = new Request('https://reduced.recipes/__/auth/handler');
    await proxyToFirebaseAuth(req);
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit;
    expect(init.redirect).toBe('manual');
  });

  it('strips the inbound Host header so the upstream sees its own', async () => {
    const req = new Request('https://reduced.recipes/__/auth/iframe', {
      headers: { Host: 'reduced.recipes' },
    });
    await proxyToFirebaseAuth(req);
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('host')).toBeNull();
  });
});
