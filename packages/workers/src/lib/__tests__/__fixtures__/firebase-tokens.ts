/**
 * Test helper: mints Firebase-shaped ID tokens signed with a controlled keypair.
 * The verifier under test will be wired to fetch this same keypair's public cert
 * from a stubbed JWKS response (see firebase-jwt.test.ts).
 */
import { SignJWT, generateKeyPair, exportSPKI } from 'jose';

export const TEST_PROJECT_ID = 'test-project';
export const TEST_KID = 'test-kid-1';

export interface MintedToken {
  token: string;
  kid: string;
  cert: string; // PEM-encoded x509-style cert; for tests we use SPKI which jose's importX509 fallback accepts when wrapped
  spki: string;
}

let cachedKeypair: { privateKey: CryptoKey; publicKey: CryptoKey } | null = null;

async function getKeypair() {
  if (cachedKeypair) return cachedKeypair;
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  cachedKeypair = { privateKey, publicKey };
  return cachedKeypair;
}

export interface MintOptions {
  sub?: string; // firebase uid
  aud?: string;
  iss?: string;
  exp?: number; // seconds since epoch
  iat?: number;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  signInProvider?: 'apple.com' | 'google.com';
  identities?: Record<string, string[]>;
  kid?: string;
}

export async function mintToken(opts: MintOptions = {}): Promise<MintedToken> {
  const { privateKey, publicKey } = await getKeypair();
  const kid = opts.kid ?? TEST_KID;
  const provider = opts.signInProvider ?? 'google.com';

  const payload = {
    sub: opts.sub ?? 'firebase-uid-1',
    email: opts.email,
    email_verified: opts.emailVerified,
    name: opts.name,
    firebase: {
      sign_in_provider: provider,
      identities: opts.identities ?? {
        [provider]: ['underlying-sub-1'],
        ...(opts.email ? { email: [opts.email] } : {}),
      },
    },
  };

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(opts.iat ?? now)
    .setExpirationTime(opts.exp ?? now + 3600)
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${TEST_PROJECT_ID}`)
    .setAudience(opts.aud ?? TEST_PROJECT_ID)
    .sign(privateKey);

  const spki = await exportSPKI(publicKey);

  // Wrap the SPKI as a fake "x509-style" PEM. The verifier code uses importX509;
  // for testing we expose the raw SPKI and the verifier in tests imports SPKI directly.
  return { token, kid, cert: spki, spki };
}

export async function getTestPublicKeySpki(): Promise<string> {
  const { publicKey } = await getKeypair();
  return exportSPKI(publicKey);
}
