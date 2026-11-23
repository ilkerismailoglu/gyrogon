import crypto from 'node:crypto';

export type SocialProvider = 'apple' | 'google' | 'facebook';

export interface VerifiedSocialIdentity {
  provider: SocialProvider;
  providerSub: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
}

export interface OAuthVerifier {
  verifyToken(provider: SocialProvider, token: string): Promise<VerifiedSocialIdentity>;
  exchangeFacebookCode?(code: string, redirectUri: string): Promise<string>;
  verifyFacebookSignedRequest(signedRequest: string): { userId: string } | null;
}

interface JwkKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

let cachedAppleKeys: { fetchedAt: number; keys: JwkKey[] } | null = null;

function decodeBase64Url(input: string): Buffer {
  const norm = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  return Buffer.from(norm + pad, 'base64');
}

async function getAppleJwks(): Promise<JwkKey[]> {
  const now = Date.now();
  if (cachedAppleKeys && now - cachedAppleKeys.fetchedAt < 1000 * 60 * 60) {
    return cachedAppleKeys.keys;
  }
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) {
    throw new Error('Could not fetch Apple JWKS');
  }
  const data = (await res.json()) as { keys: JwkKey[] };
  cachedAppleKeys = { fetchedAt: now, keys: data.keys ?? [] };
  return cachedAppleKeys.keys;
}

async function verifyAppleIdentityToken(idToken: string): Promise<VerifiedSocialIdentity> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple identity token format');
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('Malformed Apple JWT');

  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf8')) as { kid?: string };
  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8')) as {
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    exp?: number;
  };

  if (payload.iss !== 'https://appleid.apple.com' || !payload.sub) {
    throw new Error('Invalid Apple token claims');
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Apple token expired');
  }
  const expectedAud = process.env.APPLE_CLIENT_ID;
  if (expectedAud && payload.aud !== expectedAud) {
    throw new Error('Apple token audience mismatch');
  }

  const keys = await getAppleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Apple public key not found for kid');

  const pubKey = crypto.createPublicKey({
    key: jwk as unknown as crypto.JsonWebKey,
    format: 'jwk'
  });
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    pubKey,
    decodeBase64Url(sigB64)
  );
  if (!ok) throw new Error('Apple token signature invalid');

  return {
    provider: 'apple',
    providerSub: payload.sub,
    email: payload.email
  };
}

async function verifyGoogleIdToken(idToken: string): Promise<VerifiedSocialIdentity> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    throw new Error('Google idToken verification failed');
  }
  const data = (await res.json()) as {
    sub?: string;
    aud?: string;
    name?: string;
    picture?: string;
    email?: string;
  };
  if (!data.sub) throw new Error('Google token missing sub');
  const expectedAud = process.env.GOOGLE_CLIENT_ID;
  if (expectedAud && data.aud !== expectedAud) {
    throw new Error('Google token audience mismatch');
  }

  return {
    provider: 'google',
    providerSub: data.sub,
    displayName: data.name,
    avatarUrl: data.picture,
    email: data.email
  };
}

async function fetchFacebookAvatarDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const picRes = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!picRes.ok) return undefined;
    const rawType = picRes.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const mime =
      rawType === 'image/jpg'
        ? 'image/jpeg'
        : rawType === 'image/jpeg' || rawType === 'image/png' || rawType === 'image/webp'
          ? rawType
          : null;
    if (!mime) return undefined;
    const buf = Buffer.from(await picRes.arrayBuffer());
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    return dataUrl.length <= 115_000 ? dataUrl : undefined;
  } catch {
    return undefined;
  }
}

async function exchangeFacebookCodeImpl(code: string, redirectUri: string): Promise<string> {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error('Facebook OAuth is not configured');
  }
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code
  });
  const res = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Facebook code exchange failed');
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Facebook access_token missing');
  }
  return data.access_token;
}

async function verifyFacebookAccessToken(accessToken: string): Promise<VerifiedSocialIdentity> {
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  const proofParam = appSecret
    ? `&appsecret_proof=${crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex')}`
    : '';
  const res = await fetch(
    `https://graph.facebook.com/v22.0/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}${proofParam}`
  );
  if (!res.ok) {
    throw new Error('Facebook accessToken verification failed');
  }
  const data = (await res.json()) as {
    id?: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string; is_silhouette?: boolean } };
  };
  if (!data.id) throw new Error('Facebook response missing user id');

  const avatarUrl =
    data.picture?.data?.url && !data.picture?.data?.is_silhouette
      ? await fetchFacebookAvatarDataUrl(data.picture.data.url)
      : undefined;

  return {
    provider: 'facebook',
    providerSub: data.id,
    displayName: data.name,
    email: data.email?.trim().toLowerCase() || undefined,
    avatarUrl
  };
}

export function createProductionOAuthVerifier(): OAuthVerifier {
  return {
    async verifyToken(provider: SocialProvider, token: string): Promise<VerifiedSocialIdentity> {
      // Allow explicit dev-mode tokens ONLY when NODE_ENV !== 'production' and token starts with "dev:"
      if (process.env.NODE_ENV !== 'production' && token.startsWith('dev:')) {
        const [, subRaw, nameRaw] = token.split(':');
        if (subRaw && subRaw.length >= 2) {
          return {
            provider,
            providerSub: subRaw,
            displayName: nameRaw || `${provider.toUpperCase()}_${subRaw.slice(0, 6)}`
          };
        }
      }

      if (provider === 'apple') return verifyAppleIdentityToken(token);
      if (provider === 'google') return verifyGoogleIdToken(token);
      return verifyFacebookAccessToken(token);
    },

    exchangeFacebookCode(code: string, redirectUri: string): Promise<string> {
      return exchangeFacebookCodeImpl(code, redirectUri);
    },

    verifyFacebookSignedRequest(signedRequest: string): { userId: string } | null {
      const secret = process.env.FACEBOOK_APP_SECRET ?? 'gyrogon-dev-fb-secret';
      const parts = signedRequest.split('.');
      if (parts.length !== 2) return null;
      const [encodedSig, encodedPayload] = parts;
      if (!encodedSig || !encodedPayload) return null;

      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(encodedPayload)
        .digest();
      const providedSig = decodeBase64Url(encodedSig);
      if (
        expectedSig.length !== providedSig.length ||
        !crypto.timingSafeEqual(expectedSig, providedSig)
      ) {
        return null;
      }

      try {
        const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as {
          user_id?: string;
        };
        if (!payload.user_id) return null;
        return { userId: payload.user_id };
      } catch {
        return null;
      }
    }
  };
}
