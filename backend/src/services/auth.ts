import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? 'gyrogon-dev-jwt-secret';
const ACCESS_TTL_SEC = 60 * 60 * 24; // 24 hours
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export interface AuthTokenPayload {
  sub: string;
  deviceId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function signToken(payload: AuthTokenPayload, secret = JWT_SECRET): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}

export function issueTokenPair(
  userId: string,
  deviceId: string
): { accessToken: string; refreshToken: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signToken({
    sub: userId,
    deviceId,
    type: 'access',
    iat: now,
    exp: now + ACCESS_TTL_SEC
  });
  const refreshToken = signToken({
    sub: userId,
    deviceId,
    type: 'refresh',
    iat: now,
    exp: now + REFRESH_TTL_SEC
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SEC
  };
}

export function verifyJwtToken(
  token: string,
  expectedType: 'access' | 'refresh' = 'access',
  secret = JWT_SECRET
): AuthTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );
  const a = Buffer.from(expectedSig, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(body).toString('utf8')) as AuthTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= now ||
      parsed.type !== expectedType
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
