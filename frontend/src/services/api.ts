import {
  DEFAULT_SIDES,
  GameMode,
  PolygonSides,
  RecordedMove,
  getDailySeed,
  verifyGameReplay
} from '@hexacore/game-core';
import {
  enqueuePendingReplay,
  listPendingReplays,
  removePendingReplay
} from './offlineQueue';

export type SocialProvider = 'apple' | 'google' | 'facebook';
export type LeaderboardBoard = 'classic' | 'weekly' | 'daily';

export interface PlayerProfileDTO {
  id: string;
  guestDeviceId: string;
  displayName: string;
  hexaCoins: number;
  streakCount: number;
  lastStreakClaimDate: string | null;
  highScoreClassic: number;
  highScoreDaily: number;
  equippedTheme: string;
  unlockedItems: string[];
  linkedProviders?: {
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

export interface StartSessionResponse {
  sessionId: string;
  userId?: string;
  mode: GameMode;
  sides: PolygonSides;
  seed: string;
  signature: string;
  offline?: boolean;
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
  score: number;
  maxCombo: number;
  blocksCleared: number;
  updatedAt: string;
}

export interface LeaderboardData {
  board: LeaderboardBoard;
  sides?: PolygonSides;
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

const LOCAL_LB_KEY = 'hexacore_local_leaderboard_v2';
const DEVICE_ID_KEY = 'hexacore_device_id_v1';
const ACCESS_TOKEN_KEY = 'hexacore_access_token_v1';
const REFRESH_TOKEN_KEY = 'hexacore_refresh_token_v1';

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

export async function ensureGuestAuth(displayName?: string): Promise<PlayerProfileDTO | null> {
  const { accessToken, refreshToken } = getStoredTokens();
  if (accessToken) return null;

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
    } catch {
      // fall through
    }
  }

  try {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: getDeviceId(), displayName })
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
}

export async function linkSocialAccountApi(
  provider: SocialProvider,
  token: string
): Promise<{ linked: boolean; merged: boolean; player: PlayerProfileDTO } | null> {
  try {
    const res = await fetch(`/api/auth/link/${provider}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token })
    });
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

export async function deleteMyAccountApi(): Promise<boolean> {
  try {
    await fetch('/api/users/me', {
      method: 'DELETE',
      headers: authHeaders()
    });
  } catch {
    // Proceed with local data purge even if offline
  }
  clearAuthTokens();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  return true;
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
      const res = await fetch('/api/sessions/submit', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          sessionId: item.sessionId,
          signature: item.signature,
          claimedScore: item.claimedScore,
          moves: item.moves,
          playerName: item.playerName
        })
      });
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

function getLocalLeaderboard(board: LeaderboardBoard, sides: PolygonSides): LeaderboardData {
  try {
    const raw = localStorage.getItem(LOCAL_LB_KEY);
    const list: Array<Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides?: PolygonSides }> = raw
      ? (JSON.parse(raw) as Array<Omit<LeaderboardEntry, 'rank'> & { mode: GameMode; sides?: PolygonSides }>)
      : [];
    const targetMode: GameMode = board === 'daily' ? 'daily' : 'classic';
    const filtered = list
      .filter((e) => e.mode === targetMode && (e.sides ?? DEFAULT_SIDES) === sides)
      .slice(0, 20)
      .map((e, idx) => ({ ...e, rank: idx + 1 }));
    return {
      board,
      sides,
      periodKey: board === 'daily' ? new Date().toISOString().slice(0, 10) : 'local',
      engine: 'local',
      totalPlayers: filtered.length,
      entries: filtered
    };
  } catch {
    return {
      board,
      sides,
      periodKey: 'local',
      engine: 'local',
      totalPlayers: 0,
      entries: []
    };
  }
}

export async function fetchPlayerProfile(): Promise<{
  player: PlayerProfileDTO;
  quests: QuestDTO[];
  streakRewards: number[];
} | null> {
  try {
    const res = await fetch('/api/player/profile', { headers: authHeaders() });
    if (res.ok) {
      return (await res.json()) as {
        player: PlayerProfileDTO;
        quests: QuestDTO[];
        streakRewards: number[];
      };
    }
  } catch {
    // Offline fallback handled by App.tsx
  }
  return null;
}

export async function updateServerDisplayName(displayName: string): Promise<void> {
  try {
    await fetch('/api/player/profile', {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ displayName })
    });
  } catch {
    // Ignore when offline
  }
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
    const res = await fetch('/api/player/checkin', {
      method: 'POST',
      headers: authHeaders()
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
    const res = await fetch('/api/shop/purchase', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ itemCode })
    });
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
    const res = await fetch('/api/shop/equip', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ itemCode })
    });
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
    const res = await fetch('/api/quests/claim', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ questCode })
    });
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
    const res = await fetch('/api/sessions/start', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ mode, sides, playerName, deviceId: getDeviceId() })
    });
    if (res.ok) {
      return (await res.json()) as StartSessionResponse;
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
      const res = await fetch('/api/sessions/submit', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          sessionId: session.sessionId,
          signature: session.signature,
          claimedScore,
          moves,
          playerName
        })
      });
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
  sides: PolygonSides = DEFAULT_SIDES
): Promise<LeaderboardData> {
  try {
    const res = await fetch(`/api/leaderboard/${board}?sides=${sides}&limit=20`, {
      headers: authHeaders()
    });
    if (res.ok) {
      return (await res.json()) as LeaderboardData;
    }
  } catch {
    // Fallback to local scores
  }
  return getLocalLeaderboard(board, sides);
}
