import {
  DEFAULT_SIDES,
  GameMode,
  PolygonSides,
  RecordedMove,
  getDailySeed,
  verifyGameReplay
} from '@gyrogon/game-core';
import {
  enqueuePendingReplay,
  listPendingReplays,
  removePendingReplay
} from './offlineQueue';

export type SocialProvider = 'apple' | 'google' | 'facebook';
export type LeaderboardBoard = 'classic' | 'weekly' | 'daily';

export interface PlayerBanInfoDTO {
  isBanned: boolean;
  isPermanent: boolean;
  bannedUntil: string | null;
  banReason: string | null;
}

export interface PlayerProfileDTO {
  id: string;
  guestDeviceId: string;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  avatarFrame?: string;
  hexaCoins: number;
  streakCount: number;
  lastStreakClaimDate: string | null;
  highScoreClassic: number;
  highScoreDaily: number;
  equippedTheme: string;
  unlockedItems: string[];
  banInfo?: PlayerBanInfoDTO;
  linkedProviders?: {
    email?: boolean;
    apple: boolean;
    google: boolean;
    facebook: boolean;
  };
  canClaimStreakToday: boolean;
  nextStreakDay: number;
  nextStreakReward: number;
}

export interface QuestDTO {
  questCode: string;
  title: string;
  target: number;
  progress: number;
  rewardCoins: number;
  claimed: boolean;
  questDate: string;
}

export interface SideStatsDTO {
  sides: PolygonSides;
  games: number;
  bestScore: number;
  blocksCleared: number;
}

export interface RecentGameDTO {
  id: string;
  mode: GameMode;
  sides: PolygonSides;
  score: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  createdAt: string;
}

export interface PlayerStatsDTO {
  totalGames: number;
  classicGames: number;
  dailyGames: number;
  totalBlocksCleared: number;
  totalScore: number;
  averageScore: number;
  bestScore: number;
  bestScoreClassic: number;
  bestScoreDaily: number;
  bestCombo: number;
  totalCoinsEarned: number;
  questsCompleted: number;
  unlockedThemesCount: number;
  totalThemesCount: number;
  favoriteSides: PolygonSides | null;
  memberSince: string | null;
  bySides: SideStatsDTO[];
  recentGames: RecentGameDTO[];
}

export interface StartSessionResponse {
  sessionId: string;
  userId?: string;
  mode: GameMode;
  sides: PolygonSides;
  seed: string;
  signature: string;
  offline?: boolean;
  banned?: boolean;
  banInfo?: PlayerBanInfoDTO;
}

export interface SubmitSessionResponse {
  verified: boolean;
  saveStatus: 'synced' | 'local' | 'mismatch';
  source: 'backend' | 'local-verifier';
  score: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  rank?: number | null;
  moveHash?: string;
  player?: PlayerProfileDTO;
  quests?: QuestDTO[];
}

export interface LeaderboardEntry {
  rank: number;
  memberId: string;
  playerName: string;
  avatarUrl?: string;
  avatarFrame?: string;
  sides?: PolygonSides;
  score: number;
  maxCombo: number;
  blocksCleared: number;
  updatedAt: string;
}

export interface LeaderboardData {
  board: LeaderboardBoard;
  sides?: PolygonSides | 'all';
  periodKey: string;
  engine: 'redis' | 'memory' | 'local';
  totalPlayers: number;
  entries: LeaderboardEntry[];
  me?: {
    rank: number;
    entry: LeaderboardEntry;
    around: LeaderboardEntry[];
  };
}

export interface DailyChallengeInfo {
  date: string;
  seed: string;
  targets: {
    bronze: number;
    silver: number;
    gold: number;
  };
}

const LOCAL_LB_KEY = 'gyrogon_local_leaderboard_v2';
const DEVICE_ID_KEY = 'gyrogon_device_id_v1';
const ACCESS_TOKEN_KEY = 'gyrogon_access_token_v1';
const REFRESH_TOKEN_KEY = 'gyrogon_refresh_token_v1';

// Seamless one-time migration from legacy browser storage keys
try {
  const legacyPairs: Array<[string, string]> = [
    ['hexacore_local_leaderboard_v2', LOCAL_LB_KEY],
    ['hexacore_device_id_v1', DEVICE_ID_KEY],
    ['hexacore_access_token_v1', ACCESS_TOKEN_KEY],
    ['hexacore_refresh_token_v1', REFRESH_TOKEN_KEY]
  ];
  for (const [oldKey, newKey] of legacyPairs) {
    if (localStorage.getItem(newKey) === null) {
      const legacyVal = localStorage.getItem(oldKey);
      if (legacyVal !== null) {
        localStorage.setItem(newKey, legacyVal);
        localStorage.removeItem(oldKey);
      }
    }
  }
} catch {
  // ignore in non-browser contexts
}

function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  try {
    return {
      accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
      refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY)
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

function saveTokens(accessToken: string, refreshToken: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // ignore
  }
}

export function getAccessToken(): string | null {
  return getStoredTokens().accessToken;
}

export function hasStoredSession(): boolean {
  const { accessToken, refreshToken } = getStoredTokens();
  return Boolean(accessToken || refreshToken);
}

export function generateGuestDisplayName(): string {
  return `GyroPilot${10 + Math.floor(Math.random() * 990)}`;
}

export function clearAuthTokens(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id || id.length < 6) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'browser-ephemeral-device';
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return {
    'x-device-id': getDeviceId(),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...extra
  };
}

function isTokenExpiringSoon(token: string, skewSec = 60): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return true;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const decoded = JSON.parse(atob(normalized + pad)) as { exp?: unknown };
    if (typeof decoded.exp !== 'number') return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return decoded.exp <= nowSec + skewSec;
  } catch {
    return true;
  }
}

let sessionRecoveryPromise: Promise<PlayerProfileDTO | null> | null = null;

async function recoverAuthSession(displayName?: string): Promise<PlayerProfileDTO | null> {
  if (sessionRecoveryPromise) {
    return sessionRecoveryPromise;
  }

  sessionRecoveryPromise = (async () => {
    const { refreshToken } = getStoredTokens();

    if (refreshToken) {
      try {
        const refRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        if (refRes.ok) {
          const data = (await refRes.json()) as {
            accessToken: string;
            refreshToken: string;
            player: PlayerProfileDTO;
          };
          saveTokens(data.accessToken, data.refreshToken);
          return data.player;
        }
        if (refRes.status === 401 || refRes.status === 404) {
          clearAuthTokens();
        } else {
          return null;
        }
      } catch {
        return null;
      }
    }

    clearAuthTokens();
    let effectiveDisplayName = displayName?.trim();
    let savedAvatar: string | undefined;
    try {
      if (!effectiveDisplayName) {
        effectiveDisplayName = localStorage.getItem('gyrogon_player_name_v2')?.trim() || undefined;
      }
      savedAvatar = localStorage.getItem('gyrogon_avatar_url_v1')?.trim() || undefined;
    } catch {
      // ignore
    }
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          displayName: effectiveDisplayName,
          avatarUrl: savedAvatar
        })
      });
      if (res.ok) {
        const data = (await res.json()) as {
          accessToken: string;
          refreshToken: string;
          player: PlayerProfileDTO;
        };
        saveTokens(data.accessToken, data.refreshToken);
        return data.player;
      }
    } catch {
      // Offline mode
    }
    return null;
  })().finally(() => {
    sessionRecoveryPromise = null;
  });

  return sessionRecoveryPromise;
}

async function authedFetch(
  input: string,
  init: RequestInit = {},
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  const { accessToken } = getStoredTokens();
  if (accessToken && isTokenExpiringSoon(accessToken)) {
    await recoverAuthSession();
  }

  const hadBearer = Boolean(getStoredTokens().accessToken);
  const res = await fetch(input, {
    ...init,
    headers: authHeaders(extraHeaders)
  });

  if (res.status === 401 && hadBearer) {
    const errBody = (await res.clone().json().catch(() => null)) as { code?: string } | null;
    if (errBody?.code === 'INVALID_TOKEN') {
      const recovered = await recoverAuthSession();
      if (recovered) {
        return fetch(input, {
          ...init,
          headers: authHeaders(extraHeaders)
        });
      }
    }
  }

  return res;
}

export async function ensureGuestAuth(displayName?: string): Promise<PlayerProfileDTO | null> {
  const { accessToken } = getStoredTokens();
  if (accessToken && !isTokenExpiringSoon(accessToken)) return null;
  return recoverAuthSession(displayName);
}

export type EmailAuthResult =
  | { ok: true; merged: boolean; player: PlayerProfileDTO }
  | { ok: false; error: string };

export type RequestPasswordResetResult =
  | { ok: true; expiresInMinutes: number; devCode?: string }
  | { ok: false; error: string };

export interface AuthProvidersStatus {
  facebook: boolean;
  google: boolean;
  apple: boolean;
}

function parseApiErrorMessage(
  status: number,
  body: { error?: string; message?: string; code?: string } | null
): string {
  if (body?.code === 'INVALID_TOKEN' || body?.error === 'Invalid or expired access token') {
    return 'Oturum süresi doldu. Lütfen tekrar dene.';
  }
  if (status === 429) {
    return 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar dene.';
  }
  if (
    body?.error &&
    body.error !== 'Bad Request' &&
    !/^(Invalid|Internal|Unauthorized|Bad Request)/i.test(body.error)
  ) {
    return body.error;
  }
  if (status === 400) {
    return 'Lütfen geçerli bir e-posta adresi ve en az 6 karakterli şifre gir.';
  }
  if (status === 401) {
    return 'Oturum doğrulanamadı. Lütfen tekrar dene.';
  }
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
}

export async function registerEmailApi(
  email: string,
  password: string,
  displayName?: string
): Promise<EmailAuthResult> {
  try {
    let savedAvatar: string | undefined;
    try {
      savedAvatar = localStorage.getItem('gyrogon_avatar_url_v1')?.trim() || undefined;
    } catch {
      // ignore
    }
    const res = await authedFetch(
      '/api/auth/email/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName, avatarUrl: savedAvatar })
      },
      { 'Content-Type': 'application/json' }
    );
    const data = (await res.json().catch(() => null)) as
      | ({
          registered?: boolean;
          accessToken: string;
          refreshToken: string;
          player: PlayerProfileDTO;
        } & { error?: string; message?: string; code?: string })
      | null;

    if (res.ok && data?.accessToken && data.player) {
      saveTokens(data.accessToken, data.refreshToken);
      return { ok: true, merged: false, player: data.player };
    }
    return { ok: false, error: parseApiErrorMessage(res.status, data) };
  } catch {
    return { ok: false, error: 'Sunucuya bağlanılamadı. Çevrimdışı modda kayıt yapılamaz.' };
  }
}

export async function loginEmailApi(email: string, password: string): Promise<EmailAuthResult> {
  try {
    const res = await authedFetch(
      '/api/auth/email/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password })
      },
      { 'Content-Type': 'application/json' }
    );
    const data = (await res.json().catch(() => null)) as
      | ({
          loggedIn?: boolean;
          merged?: boolean;
          accessToken: string;
          refreshToken: string;
          player: PlayerProfileDTO;
        } & { error?: string; message?: string; code?: string })
      | null;

    if (res.ok && data?.accessToken && data.player) {
      saveTokens(data.accessToken, data.refreshToken);
      return { ok: true, merged: Boolean(data.merged), player: data.player };
    }
    return { ok: false, error: parseApiErrorMessage(res.status, data) };
  } catch {
    return { ok: false, error: 'Sunucuya bağlanılamadı. Çevrimdışı modda giriş yapılamaz.' };
  }
}

export async function requestPasswordResetApi(
  email: string,
  lang?: 'tr' | 'en' | 'sq'
): Promise<RequestPasswordResetResult> {
  try {
    const res = await fetch('/api/auth/email/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, ...(lang ? { lang } : {}) })
    });
    const data = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          expiresInMinutes?: number;
          devCode?: string;
          error?: string;
          message?: string;
          code?: string;
        }
      | null;

    if (res.ok && data?.ok) {
      return {
        ok: true,
        expiresInMinutes: data.expiresInMinutes ?? 15,
        ...(data.devCode ? { devCode: data.devCode } : {})
      };
    }
    return { ok: false, error: parseApiErrorMessage(res.status, data) };
  } catch {
    return { ok: false, error: 'Sunucuya bağlanılamadı. Lütfen internet bağlantını kontrol et.' };
  }
}

export async function confirmPasswordResetApi(
  email: string,
  code: string,
  newPassword: string
): Promise<EmailAuthResult> {
  try {
    const res = await fetch('/api/auth/email/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });
    const data = (await res.json().catch(() => null)) as
      | ({
          reset?: boolean;
          accessToken: string;
          refreshToken: string;
          player: PlayerProfileDTO;
        } & { error?: string; message?: string; code?: string })
      | null;

    if (res.ok && data?.accessToken && data.player) {
      saveTokens(data.accessToken, data.refreshToken);
      return { ok: true, merged: false, player: data.player };
    }
    return { ok: false, error: parseApiErrorMessage(res.status, data) };
  } catch {
    return { ok: false, error: 'Sunucuya bağlanılamadı. Lütfen internet bağlantını kontrol et.' };
  }
}

export async function fetchAuthProvidersApi(): Promise<AuthProvidersStatus> {
  try {
    const res = await fetch('/api/auth/providers');
    if (res.ok) {
      const data = (await res.json()) as Partial<AuthProvidersStatus>;
      return {
        facebook: Boolean(data.facebook),
        google: Boolean(data.google),
        apple: Boolean(data.apple)
      };
    }
  } catch {
    // Ignore when offline
  }
  return { facebook: false, google: false, apple: false };
}

export function getFacebookLoginUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    origin,
    deviceId: getDeviceId()
  });
  return `/api/auth/facebook/start?${params.toString()}`;
}

export function getGoogleLoginUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    origin,
    deviceId: getDeviceId()
  });
  return `/api/auth/google/start?${params.toString()}`;
}

export async function exchangeOAuthCodeApi(code: string): Promise<EmailAuthResult> {
  try {
    const res = await fetch('/api/auth/oauth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = (await res.json().catch(() => null)) as
      | ({
          loggedIn?: boolean;
          merged?: boolean;
          accessToken: string;
          refreshToken: string;
          player: PlayerProfileDTO;
        } & { error?: string; message?: string; code?: string })
      | null;

    if (res.ok && data?.accessToken && data.player) {
      saveTokens(data.accessToken, data.refreshToken);
      return { ok: true, merged: Boolean(data.merged), player: data.player };
    }
    return { ok: false, error: parseApiErrorMessage(res.status, data) };
  } catch {
    return { ok: false, error: 'Sunucuya bağlanılamadı. Lütfen tekrar dene.' };
  }
}

export async function logoutEmailAccount(): Promise<PlayerProfileDTO | null> {
  clearAuthTokens();
  try {
    const newId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, newId);
  } catch {
    // ignore
  }
  return null;
}

export async function linkSocialAccountApi(
  provider: SocialProvider,
  token: string
): Promise<{ linked: boolean; merged: boolean; player: PlayerProfileDTO } | null> {
  try {
    const res = await authedFetch(
      `/api/auth/link/${provider}`,
      {
        method: 'POST',
        body: JSON.stringify({ token })
      },
      { 'Content-Type': 'application/json' }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        linked: boolean;
        merged: boolean;
        accessToken: string;
        refreshToken: string;
        player: PlayerProfileDTO;
      };
      saveTokens(data.accessToken, data.refreshToken);
      return { linked: data.linked, merged: data.merged, player: data.player };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function deleteMyAccountApi(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authedFetch('/api/users/me', {
      method: 'DELETE'
    });
    if (!res.ok && res.status !== 404) {
      const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      return {
        ok: false,
        error: parseApiErrorMessage(res.status, data)
      };
    }
  } catch {
    return {
      ok: false,
      error: 'Sunucuya bağlanılamadı. Hesap silme işlemi için internet bağlantısı gerekir.'
    };
  }

  clearAuthTokens();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  try {
    const pending = await listPendingReplays();
    for (const item of pending) {
      await removePendingReplay(item.id);
    }
  } catch {
    // ignore
  }
  return { ok: true };
}

export async function syncPendingReplays(): Promise<number> {
  const pending = await listPendingReplays();
  if (pending.length === 0) return 0;

  let synced = 0;
  for (const item of pending) {
    if (item.offline) {
      const check = verifyGameReplay(
        item.seed,
        item.moves,
        item.claimedScore,
        item.sides ?? DEFAULT_SIDES
      );
      if (check.valid) {
        await removePendingReplay(item.id);
        synced += 1;
      }
      continue;
    }

    try {
      const res = await authedFetch(
        '/api/sessions/submit',
        {
          method: 'POST',
          body: JSON.stringify({
            sessionId: item.sessionId,
            signature: item.signature,
            claimedScore: item.claimedScore,
            moves: item.moves,
            playerName: item.playerName
          })
        },
        { 'Content-Type': 'application/json' }
      );
      if (res.ok || res.status === 409 || res.status === 422 || res.status === 404) {
        await removePendingReplay(item.id);
        if (res.ok) synced += 1;
      }
    } catch {
      // Still offline; stop syncing until next online event
      break;
    }
  }
  return synced;
}

function saveLocalLeaderboard(
  entry: Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides: PolygonSides }
): void {
  try {
    const raw = localStorage.getItem(LOCAL_LB_KEY);
    const list: Array<Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides?: PolygonSides }> = raw
      ? (JSON.parse(raw) as Array<Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides?: PolygonSides }>)
      : [];
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(LOCAL_LB_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    // Ignore storage quota errors
  }
}

function getLocalLeaderboard(board: LeaderboardBoard, sides?: PolygonSides): LeaderboardData {
  try {
    const raw = localStorage.getItem(LOCAL_LB_KEY);
    const list: Array<Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides?: PolygonSides }> = raw
      ? (JSON.parse(raw) as Array<Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides?: PolygonSides }>)
      : [];
    const targetMode: GameMode = board === 'daily' ? 'daily' : 'classic';
    const localAvatar = localStorage.getItem('gyrogon_avatar_url_v1') || 'preset:pilot';
    const localFrame = localStorage.getItem('gyrogon_avatar_frame_v1') || 'default';
    const myDeviceId = getDeviceId();

    const byMember = new Map<string, Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides?: PolygonSides }>();
    for (const item of list) {
      if (item.mode !== targetMode) continue;
      if (sides !== undefined && (item.sides ?? DEFAULT_SIDES) !== sides) continue;
      const existing = byMember.get(item.memberId);
      if (!existing || item.score > existing.score) {
        byMember.set(item.memberId, {
          ...item,
          sides: item.sides ?? DEFAULT_SIDES,
          avatarUrl: item.memberId === myDeviceId ? localAvatar : item.avatarUrl ?? 'preset:pilot',
          avatarFrame: item.memberId === myDeviceId ? localFrame : item.avatarFrame ?? 'default'
        });
      }
    }

    const sorted = Array.from(byMember.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map((e, idx) => ({ ...e, rank: idx + 1 }));

    const myIdx = sorted.findIndex((e) => e.memberId === myDeviceId);
    const myEntry = myIdx >= 0 ? sorted[myIdx] : undefined;

    return {
      board,
      sides: sides ?? 'all',
      periodKey: board === 'daily' ? new Date().toISOString().slice(0, 10) : 'local',
      engine: 'local',
      totalPlayers: byMember.size,
      entries: sorted,
      me: myEntry
        ? {
            rank: myIdx + 1,
            entry: myEntry,
            around: sorted.slice(Math.max(0, myIdx - 2), myIdx + 3)
          }
        : undefined
    };
  } catch {
    return {
      board,
      sides: sides ?? 'all',
      periodKey: 'local',
      engine: 'local',
      totalPlayers: 0,
      entries: []
    };
  }
}

export async function fetchPlayerProfile(
  opts: { existingOnly?: boolean } = {}
): Promise<{
  exists: boolean;
  player: PlayerProfileDTO | null;
  quests: QuestDTO[];
  streakRewards: number[];
  stats?: PlayerStatsDTO;
} | null> {
  try {
    const query = opts.existingOnly ? '?existingOnly=1' : '';
    const res =
      opts.existingOnly && !hasStoredSession()
        ? await fetch(`/api/player/profile${query}`, {
            headers: { 'x-device-id': getDeviceId() }
          })
        : await authedFetch(`/api/player/profile${query}`);
    if (res.status === 401) {
      clearAuthTokens();
      return {
        exists: false,
        player: null,
        quests: [],
        streakRewards: []
      };
    }
    if (res.ok) {
      const data = (await res.json()) as {
        exists?: boolean;
        player: PlayerProfileDTO | null;
        quests: QuestDTO[];
        streakRewards: number[];
        stats?: PlayerStatsDTO | null;
      };
      if (!data.player) {
        if (opts.existingOnly) {
          clearAuthTokens();
        }
        return {
          exists: false,
          player: null,
          quests: [],
          streakRewards: data.streakRewards ?? []
        };
      }
      return {
        exists: true,
        player: data.player,
        quests: data.quests ?? [],
        streakRewards: data.streakRewards ?? [],
        stats: data.stats ?? undefined
      };
    }
  } catch {
    // Offline fallback handled by App.tsx
  }
  return null;
}

export async function fetchPlayerStats(
  opts: { existingOnly?: boolean } = {}
): Promise<PlayerStatsDTO | null> {
  try {
    const query = opts.existingOnly ? '?existingOnly=1' : '';
    const res =
      opts.existingOnly && !hasStoredSession()
        ? await fetch(`/api/player/stats${query}`, {
            headers: { 'x-device-id': getDeviceId() }
          })
        : await authedFetch(`/api/player/stats${query}`);
    if (res.ok) {
      const data = (await res.json()) as { exists?: boolean; stats?: PlayerStatsDTO | null };
      return data.stats ?? null;
    }
  } catch {
    // Offline fallback handled by App.tsx
  }
  return null;
}

export interface PlayerProfileUpdatePatch {
  displayName?: string;
  avatarUrl?: string;
  avatarFrame?: string;
}

export async function updateServerProfile(
  patch: PlayerProfileUpdatePatch
): Promise<PlayerProfileDTO | null> {
  try {
    const res = await authedFetch(
      '/api/player/profile',
      {
        method: 'PATCH',
        body: JSON.stringify(patch)
      },
      { 'Content-Type': 'application/json' }
    );
    if (res.ok) {
      const data = (await res.json()) as { player?: PlayerProfileDTO };
      return data.player ?? null;
    }
  } catch {
    // Ignore when offline
  }
  return null;
}

export async function updateServerDisplayName(
  displayName: string
): Promise<PlayerProfileDTO | null> {
  return updateServerProfile({ displayName });
}

export async function claimDailyStreak(): Promise<{
  claimed: boolean;
  alreadyClaimed: boolean;
  streakCount: number;
  rewardCoins: number;
  hexaCoins: number;
  player?: PlayerProfileDTO;
} | null> {
  try {
    if (!hasStoredSession()) await ensureGuestAuth();
    const res = await authedFetch('/api/player/checkin', {
      method: 'POST'
    });
    if (res.ok) {
      return (await res.json()) as {
        claimed: boolean;
        alreadyClaimed: boolean;
        streakCount: number;
        rewardCoins: number;
        hexaCoins: number;
        player?: PlayerProfileDTO;
      };
    }
  } catch {
    // Offline fallback
  }
  return null;
}

export async function purchaseThemeApi(itemCode: string): Promise<{
  hexaCoins: number;
  unlockedItems: string[];
  equippedTheme: string;
} | null> {
  try {
    if (!hasStoredSession()) await ensureGuestAuth();
    const res = await authedFetch(
      '/api/shop/purchase',
      {
        method: 'POST',
        body: JSON.stringify({ itemCode })
      },
      { 'Content-Type': 'application/json' }
    );
    if (res.ok) {
      return (await res.json()) as {
        hexaCoins: number;
        unlockedItems: string[];
        equippedTheme: string;
      };
    }
  } catch {
    // Offline fallback
  }
  return null;
}

export async function equipThemeApi(itemCode: string): Promise<{
  equippedTheme: string;
  unlockedItems: string[];
} | null> {
  try {
    if (!hasStoredSession()) await ensureGuestAuth();
    const res = await authedFetch(
      '/api/shop/equip',
      {
        method: 'POST',
        body: JSON.stringify({ itemCode })
      },
      { 'Content-Type': 'application/json' }
    );
    if (res.ok) {
      return (await res.json()) as {
        equippedTheme: string;
        unlockedItems: string[];
      };
    }
  } catch {
    // Offline fallback
  }
  return null;
}

export async function claimQuestApi(questCode: string): Promise<{
  quest: QuestDTO;
  rewardCoins: number;
  hexaCoins: number;
} | null> {
  try {
    if (!hasStoredSession()) await ensureGuestAuth();
    const res = await authedFetch(
      '/api/quests/claim',
      {
        method: 'POST',
        body: JSON.stringify({ questCode })
      },
      { 'Content-Type': 'application/json' }
    );
    if (res.ok) {
      return (await res.json()) as {
        quest: QuestDTO;
        rewardCoins: number;
        hexaCoins: number;
      };
    }
  } catch {
    // Offline fallback
  }
  return null;
}

export async function fetchDailyChallenge(): Promise<DailyChallengeInfo> {
  try {
    const res = await fetch('/api/daily');
    if (res.ok) {
      return (await res.json()) as DailyChallengeInfo;
    }
  } catch {
    // Fallback to deterministic local daily seed
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    date: today,
    seed: getDailySeed(today),
    targets: { bronze: 500, silver: 1500, gold: 3000 }
  };
}

export async function startSession(
  mode: GameMode,
  playerName: string,
  sides: PolygonSides = DEFAULT_SIDES
): Promise<StartSessionResponse> {
  try {
    const res = await authedFetch(
      '/api/sessions/start',
      {
        method: 'POST',
        body: JSON.stringify({ mode, sides, playerName, deviceId: getDeviceId() })
      },
      { 'Content-Type': 'application/json' }
    );
    if (res.ok) {
      return (await res.json()) as StartSessionResponse;
    }
    if (res.status === 403) {
      const errData = (await res.json().catch(() => null)) as {
        code?: string;
        banInfo?: PlayerBanInfoDTO;
      } | null;
      if (errData?.code === 'ACCOUNT_BANNED') {
        return {
          sessionId: 'banned',
          mode,
          sides,
          seed: '',
          signature: '',
          offline: true,
          banned: true,
          banInfo: errData.banInfo
        };
      }
    }
  } catch {
    // Offline/frontend-only fallback
  }

  const seed =
    mode === 'daily'
      ? getDailySeed(undefined, sides)
      : `LOCAL-${sides}G-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  return {
    sessionId: `local-${Date.now()}`,
    mode,
    sides,
    seed,
    signature: 'offline',
    offline: true
  };
}

export async function submitSession(params: {
  session: StartSessionResponse;
  claimedScore: number;
  moves: RecordedMove[];
  playerName: string;
}): Promise<SubmitSessionResponse> {
  const { session, claimedScore, moves, playerName } = params;

  if (!session.offline) {
    try {
      const res = await authedFetch(
        '/api/sessions/submit',
        {
          method: 'POST',
          body: JSON.stringify({
            sessionId: session.sessionId,
            signature: session.signature,
            claimedScore,
            moves,
            playerName
          })
        },
        { 'Content-Type': 'application/json' }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          verified: boolean;
          score: number;
          maxCombo: number;
          blocksCleared: number;
          coinsEarned: number;
          rank?: number | null;
          moveHash: string;
          player?: PlayerProfileDTO;
          quests?: QuestDTO[];
        };
        saveLocalLeaderboard({
          memberId: session.userId ?? getDeviceId(),
          playerName,
          mode: session.mode,
          sides: session.sides ?? DEFAULT_SIDES,
          score: data.score,
          maxCombo: data.maxCombo,
          blocksCleared: data.blocksCleared,
          updatedAt: new Date().toISOString()
        });
        return {
          verified: data.verified,
          saveStatus: data.verified ? 'synced' : 'mismatch',
          source: 'backend',
          score: data.score,
          maxCombo: data.maxCombo,
          blocksCleared: data.blocksCleared,
          coinsEarned: data.coinsEarned,
          rank: data.rank,
          moveHash: data.moveHash,
          player: data.player,
          quests: data.quests
        };
      }
      if (res.status === 422) {
        return {
          verified: false,
          saveStatus: 'mismatch',
          source: 'backend',
          score: claimedScore,
          maxCombo: 1,
          blocksCleared: 0,
          coinsEarned: 0
        };
      }
    } catch {
      // Fall through to local deterministic verifier
    }
  }

  const sessionSides = session.sides ?? DEFAULT_SIDES;
  const localResult = verifyGameReplay(session.seed, moves, claimedScore, sessionSides);
  if (localResult.valid) {
    await enqueuePendingReplay({
      id: `${session.sessionId}-${Date.now()}`,
      sessionId: session.sessionId,
      signature: session.signature,
      mode: session.mode,
      sides: sessionSides,
      seed: session.seed,
      claimedScore,
      moves,
      playerName,
      offline: Boolean(session.offline),
      createdAt: new Date().toISOString()
    });
    saveLocalLeaderboard({
      memberId: getDeviceId(),
      playerName,
      mode: session.mode,
      sides: sessionSides,
      score: localResult.simulatedScore,
      maxCombo: localResult.maxCombo,
      blocksCleared: localResult.blocksCleared,
      updatedAt: new Date().toISOString()
    });
  }
  return {
    verified: localResult.valid,
    saveStatus: localResult.valid ? 'local' : 'local',
    source: 'local-verifier',
    score: localResult.valid ? localResult.simulatedScore : claimedScore,
    maxCombo: localResult.maxCombo,
    blocksCleared: localResult.blocksCleared,
    coinsEarned: localResult.coinsEarned
  };
}

export async function fetchLeaderboard(
  board: LeaderboardBoard,
  sides?: PolygonSides
): Promise<LeaderboardData> {
  try {
    const query = sides !== undefined ? `?sides=${sides}&limit=100` : '?limit=100';
    const res = await authedFetch(`/api/leaderboard/${board}${query}`);
    if (res.ok) {
      return (await res.json()) as LeaderboardData;
    }
  } catch {
    // Fallback to local scores
  }
  return getLocalLeaderboard(board, sides);
}
