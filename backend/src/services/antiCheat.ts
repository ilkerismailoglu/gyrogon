import crypto from 'node:crypto';
import {
  DEFAULT_SIDES,
  PolygonSides,
  RecordedMove,
  ReplayVerificationResult,
  verifyGameReplay
} from '@hexacore/game-core';

const DEFAULT_SECRET = process.env.SESSION_SECRET ?? 'hexacore-dev-hmac-secret';

export function signSessionToken(
  sessionId: string,
  seed: string,
  mode: string,
  sides: PolygonSides = DEFAULT_SIDES
): string {
  return crypto
    .createHmac('sha256', DEFAULT_SECRET)
    .update(`${sessionId}:${seed}:${mode}:${sides}`)
    .digest('hex');
}

export function verifySessionToken(
  sessionId: string,
  seed: string,
  mode: string,
  signature: string,
  sides: PolygonSides = DEFAULT_SIDES
): boolean {
  const expected = signSessionToken(sessionId, seed, mode, sides);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function hashMoveStream(seed: string, moves: RecordedMove[]): string {
  return crypto
    .createHash('sha256')
    .update(`${seed}:${JSON.stringify(moves)}`)
    .digest('hex');
}

export function verifySessionSubmission(
  seed: string,
  moves: RecordedMove[],
  claimedScore: number,
  sides: PolygonSides = DEFAULT_SIDES
): ReplayVerificationResult {
  return verifyGameReplay(seed, moves, claimedScore, sides);
}
