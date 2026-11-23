import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? 'gyrogon-dev-jwt-secret';
const ACCESS_TTL_SEC = 60 * 60 * 24; // 24 hours
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const ADMIN_TTL_SEC = 60 * 60 * 12; // 12 hours
const DEV_DEFAULT_ADMIN_PASSWORD = 'gyrogon-admin';

export interface AuthTokenPayload {
  sub: string;
  deviceId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export interface AdminTokenPayload {
  sub: 'admin';
  role: 'admin';
  type: 'admin';
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

function signToken(payload: AuthTokenPayload | AdminTokenPayload, secret = JWT_SECRET): string {
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

export function verifyAdminPassword(candidate: string): { ok: boolean; misconfigured?: boolean } {
  const configured = process.env.ADMIN_PASSWORD?.trim();
  if (!configured && process.env.NODE_ENV === 'production') {
    return { ok: false, misconfigured: true };
  }
  const expected = configured || DEV_DEFAULT_ADMIN_PASSWORD;
  const a = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return { ok: crypto.timingSafeEqual(a, b) };
}

export function issueAdminToken(): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({
    sub: 'admin',
    role: 'admin',
    type: 'admin',
    iat: now,
    exp: now + ADMIN_TTL_SEC
  });
  return { token, expiresIn: ADMIN_TTL_SEC };
}

export function verifyAdminToken(token: string, secret = JWT_SECRET): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return false;

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );
  const a = Buffer.from(expectedSig, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(body).toString('utf8')) as Partial<AdminTokenPayload>;
    const now = Math.floor(Date.now() / 1000);
    return (
      parsed.sub === 'admin' &&
      parsed.role === 'admin' &&
      parsed.type === 'admin' &&
      typeof parsed.exp === 'number' &&
      parsed.exp > now
    );
  } catch {
    return false;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hashHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function generateResetCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashResetCode(email: string, code: string): string {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`reset:${email.trim().toLowerCase()}:${code.trim()}`)
    .digest('hex');
}

export function verifyResetCodeHash(email: string, code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashResetCode(email, code), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export interface OAuthStatePayload {
  provider: 'facebook';
  deviceId?: string;
  origin: string;
  nonce: string;
  exp: number;
}

export function signOAuthState(
  input: { provider: 'facebook'; deviceId?: string; origin: string },
  ttlSec = 600
): string {
  const payload: OAuthStatePayload = {
    provider: input.provider,
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    origin: input.origin,
    nonce: crypto.randomBytes(12).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSec
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`oauth_state:${encoded}`).digest()
  );
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(token: string): OAuthStatePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`oauth_state:${encoded}`).digest()
  );
  const a = Buffer.from(expectedSig, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded).toString('utf8')) as Partial<OAuthStatePayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      parsed.provider !== 'facebook' ||
      typeof parsed.origin !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= now
    ) {
      return null;
    }
    return parsed as OAuthStatePayload;
  } catch {
    return null;
  }
}

export interface OAuthHandoffPayload {
  userId: string;
  deviceId: string;
  merged: boolean;
  provider: 'facebook';
  nonce: string;
  exp: number;
}

export function signOAuthHandoff(
  input: { userId: string; deviceId: string; merged: boolean; provider: 'facebook' },
  ttlSec = 60
): string {
  const payload: OAuthHandoffPayload = {
    userId: input.userId,
    deviceId: input.deviceId,
    merged: input.merged,
    provider: input.provider,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSec
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`oauth_handoff:${encoded}`).digest()
  );
  return `${encoded}.${sig}`;
}

export function verifyOAuthHandoff(code: string): OAuthHandoffPayload | null {
  const parts = code.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`oauth_handoff:${encoded}`).digest()
  );
  const a = Buffer.from(expectedSig, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      base64UrlDecode(encoded).toString('utf8')
    ) as Partial<OAuthHandoffPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      parsed.provider !== 'facebook' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.deviceId !== 'string' ||
      typeof parsed.merged !== 'boolean' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= now
    ) {
      return null;
    }
    return parsed as OAuthHandoffPayload;
  } catch {
    return null;
  }
}
