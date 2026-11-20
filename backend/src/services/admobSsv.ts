import crypto from 'node:crypto';

export interface AdMobKeyProvider {
  getPublicKeyPem(keyId: string): Promise<string | null>;
}

export interface AdMobSsvVerificationResult {
  valid: boolean;
  transactionId?: string;
  userId?: string;
  rewardItem?: string;
  rewardAmount?: number;
  customData?: string;
  keyId?: string;
  reason?: string;
}

let cachedAdMobKeys: { fetchedAt: number; keys: Map<string, string> } | null = null;

export function createGoogleAdMobKeyProvider(): AdMobKeyProvider {
  return {
    async getPublicKeyPem(keyId: string): Promise<string | null> {
      const now = Date.now();
      if (!cachedAdMobKeys || now - cachedAdMobKeys.fetchedAt > 1000 * 60 * 60 * 12) {
        const res = await fetch('https://www.gstatic.com/admob/reward/verifier-keys.json');
        if (!res.ok) return null;
        const data = (await res.json()) as {
          keys?: Array<{ keyId: number; pem: string }>;
        };
        const map = new Map<string, string>();
        for (const k of data.keys ?? []) {
          map.set(String(k.keyId), k.pem);
        }
        cachedAdMobKeys = { fetchedAt: now, keys: map };
      }
      return cachedAdMobKeys.keys.get(keyId) ?? null;
    }
  };
}

function base64UrlToBuffer(input: string): Buffer {
  const norm = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  return Buffer.from(norm + pad, 'base64');
}

/**
 * Verifies a Google AdMob Server-Side Verification (SSV) callback query string
 * using ECDSA-SHA256 against the public key matching `key_id`.
 * Per Google spec: the signed message is the raw query string up to `&signature=`.
 */
export async function verifyAdMobSsvCallback(
  rawQueryString: string,
  keyProvider: AdMobKeyProvider = createGoogleAdMobKeyProvider()
): Promise<AdMobSsvVerificationResult> {
  const sigMarker = '&signature=';
  const sigIndex = rawQueryString.indexOf(sigMarker);
  if (sigIndex <= 0) {
    return { valid: false, reason: 'Missing signature parameter in query string' };
  }

  const contentToVerify = rawQueryString.slice(0, sigIndex);
  const params = new URLSearchParams(rawQueryString);
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  const transactionId = params.get('transaction_id');
  const userId = params.get('user_id') ?? undefined;
  const customData = params.get('custom_data') ?? undefined;
  const rewardItem = params.get('reward_item') ?? 'hexa_coins';
  const rewardAmount = Number(params.get('reward_amount') ?? '50');

  if (!signature || !keyId || !transactionId) {
    return { valid: false, reason: 'Missing required SSV fields (signature, key_id, transaction_id)' };
  }

  const publicKeyPem = await keyProvider.getPublicKeyPem(keyId);
  if (!publicKeyPem) {
    return { valid: false, reason: `Unknown AdMob verifier key_id: ${keyId}` };
  }

  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(contentToVerify, 'utf8');
    verify.end();

    const sigBuf = base64UrlToBuffer(signature);
    const ok = verify.verify(publicKeyPem, sigBuf);
    if (!ok) {
      return { valid: false, reason: 'Invalid ECDSA signature' };
    }

    return {
      valid: true,
      transactionId,
      userId,
      customData,
      rewardItem,
      rewardAmount: Number.isFinite(rewardAmount) && rewardAmount > 0 ? Math.floor(rewardAmount) : 50,
      keyId
    };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : 'Signature verification error'
    };
  }
}
