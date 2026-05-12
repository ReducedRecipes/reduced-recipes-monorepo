/**
 * Reverse-proxy a request to Firebase Auth's reserved __/auth/* and __/firebase/*
 * paths through the app's own origin. Firebase's signInWithRedirect (and
 * signInWithPopup) relies on reading state from an iframe hosted on the
 * Firebase auth domain. Since iOS 14, WebKit-based browsers (Safari, Chrome on
 * iOS) partition storage by top-level site, so an iframe on
 * <project>.firebaseapp.com cannot read the state that was written to it
 * during the redirect leg. By serving the same Firebase handler under
 * reduced.recipes/__/auth/*, the iframe is same-origin with the SPA and ITP
 * leaves it alone.
 *
 * See https://firebase.google.com/docs/auth/web/redirect-best-practices.
 */

const UPSTREAM_HOST = 'reducedrecipes.firebaseapp.com';

export function proxyToFirebaseAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  url.hostname = UPSTREAM_HOST;
  url.protocol = 'https:';
  url.port = '';

  const headers = new Headers(request.headers);
  headers.delete('host');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  return fetch(url.toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    redirect: 'manual',
  });
}
