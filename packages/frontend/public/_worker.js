/**
 * Pages "advanced" mode worker. When Cloudflare Pages sees `_worker.js`
 * in the deploy output it routes every request through this module and
 * we explicitly fall back to static assets via `env.ASSETS.fetch`.
 *
 * We use it to reverse-proxy Firebase's reserved /__/auth/* and
 * /__/firebase/* paths to the Firebase auth domain. Without this, the
 * SPA's catch-all 200 OK index.html swallows the redirect handshake
 * and sign-in fails (the URL stays on /__/auth/handler? and the user
 * lands on the homepage logged out).
 *
 * The earlier attempt placed the proxy in packages/frontend/functions/
 * which works for Pages projects built by Cloudflare itself but is
 * NOT auto-discovered when we direct-upload the built dist via
 * `wrangler pages deploy <dir>`. A pre-built _worker.js avoids that
 * ambiguity entirely.
 */

const UPSTREAM_HOST = 'reducedrecipes.firebaseapp.com';

function isFirebaseAuthPath(pathname) {
  return pathname.startsWith('/__/auth/') || pathname.startsWith('/__/firebase/');
}

async function proxyToFirebaseAuth(request) {
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isFirebaseAuthPath(url.pathname)) {
      return proxyToFirebaseAuth(request);
    }
    return env.ASSETS.fetch(request);
  },
};
