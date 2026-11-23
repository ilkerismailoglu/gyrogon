import crypto from 'node:crypto';
import {
  DEFAULT_SIDES,
  GameMode,
  PolygonSides,
  SUPPORTED_SIDES,
  getDailySeed,
  isSupportedSides
} from '@gyrogon/game-core';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  DAILY_QUEST_TEMPLATES,
  DEFAULT_AVATAR_FRAME,
  DEFAULT_AVATAR_URL,
  DEFAULT_SHOP_ITEMS,
  STREAK_REWARDS,
  ShopItemDef,
  getPreviousUtcDateString,
  getUtcDateString,
  isValidAvatarUrl,
  syncShopCatalog
} from '../db/catalog.js';
import * as schema from '../db/schema.js';
import {
  AdminAnalyticsQuery,
  AdminAnalyticsReport,
  PlayerVisitSummary,
  RecordHeartbeatInput,
  RecordVisitInput,
  StoredSiteVisit,
  aggregateVisitsReport,
  buildPlayerVisitSummary,
  resolveAnalyticsWindow
} from './analytics.js';
import { VerifiedSocialIdentity } from './oauth.js';

export interface PlayerBanInfo {
  isBanned: boolean;
  isPermanent: boolean;
  bannedUntil: string | null;
  banReason: string | null;
}

export interface AdminRewardRecord {
  id: string;
  userId: string | null;
  recipientName: string;
  scope: 'single' | 'registered' | 'all';
  coinsAmount: number;
  themeCode: string | null;
  reason: string;
  createdAt: string;
}

export interface AdminGrantRewardInput {
  scope: 'single' | 'registered' | 'all';
  userId?: string;
  coinsAmount?: number;
  themeCode?: string;
  reason?: string;
}

export interface AdminGrantRewardResult {
  affectedCount: number;
  reward: AdminRewardRecord;
  playerDetail?: AdminPlayerDetail;
}

export interface PlayerProfile {
  id: string;
  guestDeviceId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string;
  avatarFrame: string;
  hexaCoins: number;
  streakCount: number;
  lastStreakClaimDate: string | null;
  highScoreClassic: number;
  highScoreDaily: number;
  equippedTheme: string;
  unlockedItems: string[];
  banInfo: PlayerBanInfo;
  linkedProviders: {
    email: boolean;
    apple: boolean;
    google: boolean;
    facebook: boolean;
  };
  canClaimStreakToday: boolean;
  nextStreakDay: number;
  nextStreakReward: number;
}

export interface PlayerPublicIdentity {
  displayName: string;
  avatarUrl: string;
  avatarFrame: string;
}

export interface UpdatePlayerProfilePatch {
  displayName?: string;
  avatarUrl?: string;
  avatarFrame?: string;
}

export interface ShopCatalogItem extends ShopItemDef {
  unlocked: boolean;
  equipped: boolean;
}

export interface QuestProgressItem {
  questCode: string;
  title: string;
  target: number;
  progress: number;
  rewardCoins: number;
  claimed: boolean;
  questDate: string;
}

export interface StreakClaimResult {
  claimed: boolean;
  alreadyClaimed: boolean;
  streakCount: number;
  rewardCoins: number;
  hexaCoins: number;
  claimDate: string;
}

export interface SideStatsItem {
  sides: PolygonSides;
  games: number;
  bestScore: number;
  blocksCleared: number;
}

export interface RecentGameItem {
  id: string;
  mode: GameMode;
  sides: PolygonSides;
  score: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  createdAt: string;
}

export interface PlayerStats {
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
  bySides: SideStatsItem[];
  recentGames: RecentGameItem[];
}

export interface AdminDailyPoint {
  date: string;
  newUsers: number;
  games: number;
  activePlayers: number;
}

export interface AdminThemeStat {
  code: string;
  name: string;
  price: number;
  unlockedCount: number;
  equippedCount: number;
}

export interface AdminSideOverview {
  sides: PolygonSides;
  games: number;
  averageScore: number;
  bestScore: number;
  totalBlocksCleared: number;
}

export interface AdminOverview {
  totalUsers: number;
  registeredUsers: number;
  guestUsers: number;
  bannedUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  activePlayersToday: number;
  activePlayers7d: number;
  totalGames: number;
  classicGames: number;
  dailyGames: number;
  gamesToday: number;
  games7d: number;
  totalSessions: number;
  verifiedSessions: number;
  totalBlocksCleared: number;
  totalScore: number;
  averageScore: number;
  highestScore: number;
  highestScorePlayer: string | null;
  bestCombo: number;
  totalCoinsInCirculation: number;
  totalCoinsEarnedFromGames: number;
  questsCompletedTotal: number;
  paidThemesUnlockedTotal: number;
  dailyTrend: AdminDailyPoint[];
  bySides: AdminSideOverview[];
  themes: AdminThemeStat[];
}

export interface AdminPlayerSummary {
  id: string;
  displayName: string;
  email: string | null;
  guestDeviceId: string;
  accountType: 'registered' | 'guest';
  hexaCoins: number;
  streakCount: number;
  highScoreClassic: number;
  highScoreDaily: number;
  bestScore: number;
  equippedTheme: string;
  unlockedThemesCount: number;
  totalGames: number;
  totalBlocksCleared: number;
  bestCombo: number;
  isBanned: boolean;
  isPermanentBan: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  lastLoginDate: string | null;
  lastPlayedAt: string | null;
  createdAt: string;
}

export interface AdminPlayerListQuery {
  q?: string;
  accountType?: 'all' | 'registered' | 'guest' | 'banned';
  sort?: 'newest' | 'best_score' | 'most_games' | 'most_coins' | 'last_active';
  page?: number;
  pageSize?: number;
}

export interface AdminPlayerListResult {
  items: AdminPlayerSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminPlayerDetail {
  player: PlayerProfile;
  stats: PlayerStats;
  quests: QuestProgressItem[];
  createdAt: string;
  updatedAt: string;
  lastLoginDate: string | null;
  recentGames: RecentGameItem[];
  visitSummary?: PlayerVisitSummary;
}

export interface AdminUpdatePlayerInput {
  displayName?: string;
  hexaCoins?: number;
  coinsDelta?: number;
  streakCount?: number;
  unlockThemeCode?: string;
  equippedTheme?: string;
}

export interface AdminScoreItem {
  id: string;
  sessionId: string;
  userId: string | null;
  playerName: string;
  userEmail: string | null;
  mode: GameMode;
  sides: PolygonSides;
  score: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  moveHash: string;
  createdAt: string;
}

export interface AdminScoreListQuery {
  q?: string;
  mode?: 'all' | 'classic' | 'daily';
  sides?: PolygonSides;
  sort?: 'newest' | 'score' | 'blocks' | 'combo';
  page?: number;
  pageSize?: number;
}

export interface AdminScoreListResult {
  items: AdminScoreItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StoredSession {
  id: string;
  userId: string;
  mode: GameMode;
  sides?: PolygonSides;
  seed: string;
  signature: string;
  playerName: string;
  verified: boolean;
  finalScore: number | null;
  startedAt: string;
  submittedAt?: string;
}

export interface StoredScore {
  id: string;
  userId: string;
  sessionId: string;
  playerName: string;
  mode: GameMode;
  sides: PolygonSides;
  score: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  moveHash: string;
  createdAt: string;
}

export interface DailySeedInfo {
  date: string;
  seed: string;
  targets: {
    bronze: number;
    silver: number;
    gold: number;
  };
}

export class StoreError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface GameStore {
  readonly modeLabel: 'postgres' | 'memory';
  getOrCreatePlayer(
    deviceId: string,
    displayName?: string,
    today?: string,
    avatarUrl?: string
  ): Promise<PlayerProfile>;
  getPlayerByDeviceId(deviceId: string, today?: string): Promise<PlayerProfile | undefined>;
  getPlayerById(userId: string, today?: string): Promise<PlayerProfile | undefined>;
  updateDisplayName(userId: string, displayName: string, today?: string): Promise<PlayerProfile>;
  updateProfile(
    userId: string,
    patch: UpdatePlayerProfilePatch,
    today?: string
  ): Promise<PlayerProfile>;
  getPlayerPublicIdentities(userIds: string[]): Promise<Map<string, PlayerPublicIdentity>>;
  getDailySeedInfo(dateStr?: string): Promise<DailySeedInfo>;

  createSession(session: StoredSession): Promise<void>;
  getSession(sessionId: string): Promise<StoredSession | undefined>;
  finalizeVerifiedSession(params: {
    sessionId: string;
    userId: string;
    playerName: string;
    mode: GameMode;
    sides?: PolygonSides;
    score: number;
    maxCombo: number;
    blocksCleared: number;
    coinsEarned: number;
    moveHash: string;
    today?: string;
  }): Promise<{ scoreEntry: StoredScore; player: PlayerProfile; quests: QuestProgressItem[] }>;

  getShopCatalog(userId: string): Promise<{
    hexaCoins: number;
    equippedTheme: string;
    items: ShopCatalogItem[];
  }>;
  purchaseShopItem(
    userId: string,
    itemCode: string
  ): Promise<{ hexaCoins: number; unlockedItems: string[]; equippedTheme: string }>;
  equipShopItem(
    userId: string,
    itemCode: string
  ): Promise<{ equippedTheme: string; unlockedItems: string[] }>;

  getDailyQuests(userId: string, dateStr?: string): Promise<QuestProgressItem[]>;
  claimDailyQuest(
    userId: string,
    questCode: string,
    dateStr?: string
  ): Promise<{ quest: QuestProgressItem; rewardCoins: number; hexaCoins: number }>;

  claimDailyStreak(userId: string, dateStr?: string): Promise<StreakClaimResult>;

  linkSocialAccount(
    userId: string,
    identity: VerifiedSocialIdentity
  ): Promise<{ player: PlayerProfile; mergedFromUserId?: string }>;

  deleteUserAccount(userId: string): Promise<{ deleted: boolean; userId: string }>;
  deleteByFacebookId(facebookId: string): Promise<{ deleted: boolean; deletedUserId?: string }>;

  registerEmailAccount(
    userId: string,
    email: string,
    passwordHash: string,
    displayName?: string
  ): Promise<PlayerProfile>;
  loginEmailAccount(
    currentUserId: string | undefined,
    email: string,
    password: string,
    verifyFn: (pw: string, hash: string) => boolean
  ): Promise<{ player: PlayerProfile; mergedFromUserId?: string }>;
  createPasswordResetToken(
    email: string,
    codeHash: string,
    opts?: { ttlMinutes?: number; cooldownSeconds?: number }
  ): Promise<{
    created: boolean;
    userId?: string;
    displayName?: string;
    cooldownActive?: boolean;
  }>;
  consumePasswordResetToken(
    email: string,
    verifyCodeFn: (codeHash: string) => boolean,
    newPasswordHash: string
  ): Promise<PlayerProfile>;

  getPlayerStats(userId: string): Promise<PlayerStats>;

  getAdminOverview(): Promise<AdminOverview>;
  listAdminPlayers(query: AdminPlayerListQuery): Promise<AdminPlayerListResult>;
  getAdminPlayerDetail(userId: string): Promise<AdminPlayerDetail | undefined>;
  updateAdminPlayer(userId: string, patch: AdminUpdatePlayerInput): Promise<AdminPlayerDetail>;
  banPlayer(
    userId: string,
    input: { durationHours?: number | null; reason?: string }
  ): Promise<AdminPlayerDetail>;
  unbanPlayer(userId: string): Promise<AdminPlayerDetail>;
  grantAdminReward(input: AdminGrantRewardInput): Promise<AdminGrantRewardResult>;
  listAdminRewards(limit?: number): Promise<AdminRewardRecord[]>;
  getAdminPasswordHash(): Promise<string | null>;
  setAdminPasswordHash(passwordHash: string): Promise<void>;
  listAdminScores(query: AdminScoreListQuery): Promise<AdminScoreListResult>;
  deleteAdminScore(scoreId: string): Promise<{ deleted: boolean; userId?: string }>;

  recordSiteVisit(input: RecordVisitInput): Promise<void>;
  recordSiteHeartbeat(input: RecordHeartbeatInput): Promise<void>;
  getAdminAnalytics(query: AdminAnalyticsQuery): Promise<AdminAnalyticsReport>;

  grantAdReward(params: {
    transactionId: string;
    userId: string;
    rewardItem: string;
    rewardAmount: number;
    keyId: string;
  }): Promise<{ granted: boolean; duplicate: boolean; hexaCoins: number }>;

  close?(): Promise<void>;
}

function computeBanInfo(
  isBanned: boolean,
  bannedUntil: Date | string | null | undefined,
  banReason: string | null | undefined,
  now = new Date()
): PlayerBanInfo {
  if (!isBanned) {
    return {
      isBanned: false,
      isPermanent: false,
      bannedUntil: null,
      banReason: null
    };
  }
  const untilDate =
    bannedUntil instanceof Date
      ? bannedUntil
      : typeof bannedUntil === 'string' && bannedUntil.length > 0
        ? new Date(bannedUntil)
        : null;

  if (untilDate && Number.isFinite(untilDate.getTime()) && untilDate.getTime() <= now.getTime()) {
    return {
      isBanned: false,
      isPermanent: false,
      bannedUntil: null,
      banReason: null
    };
  }

  return {
    isBanned: true,
    isPermanent: untilDate === null,
    bannedUntil: untilDate ? untilDate.toISOString() : null,
    banReason: banReason?.trim() ? banReason.trim() : null
  };
}

function buildLast14UtcDates(today = getUtcDateString()): string[] {
  const base = new Date(`${today}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function finalizePlayerStats(params: {
  totalGames: number;
  classicGames: number;
  dailyGames: number;
  totalBlocksCleared: number;
  totalScore: number;
  bestScoreClassic: number;
  bestScoreDaily: number;
  bestCombo: number;
  totalCoinsEarned: number;
  questsCompleted: number;
  unlockedThemesCount: number;
  memberSince: string | null;
  sideMap: Map<PolygonSides, { games: number; bestScore: number; blocksCleared: number }>;
  recentGames: RecentGameItem[];
}): PlayerStats {
  const bestScoreClassic = params.bestScoreClassic;
  const bestScoreDaily = params.bestScoreDaily;
  const bestScore = Math.max(bestScoreClassic, bestScoreDaily);
  const averageScore = params.totalGames > 0 ? Math.round(params.totalScore / params.totalGames) : 0;

  const bySides: SideStatsItem[] = SUPPORTED_SIDES.map((s) => {
    const entry = params.sideMap.get(s);
    return {
      sides: s,
      games: entry?.games ?? 0,
      bestScore: entry?.bestScore ?? 0,
      blocksCleared: entry?.blocksCleared ?? 0
    };
  });

  let favoriteSides: PolygonSides | null = null;
  if (params.totalGames > 0) {
    let bestSide: SideStatsItem | undefined;
    for (const item of bySides) {
      if (item.games === 0) continue;
      if (
        !bestSide ||
        item.games > bestSide.games ||
        (item.games === bestSide.games && item.bestScore > bestSide.bestScore)
      ) {
        bestSide = item;
      }
    }
    favoriteSides = bestSide?.sides ?? null;
  }

  return {
    totalGames: params.totalGames,
    classicGames: params.classicGames,
    dailyGames: params.dailyGames,
    totalBlocksCleared: params.totalBlocksCleared,
    totalScore: params.totalScore,
    averageScore,
    bestScore,
    bestScoreClassic,
    bestScoreDaily,
    bestCombo: params.bestCombo,
    totalCoinsEarned: params.totalCoinsEarned,
    questsCompleted: params.questsCompleted,
    unlockedThemesCount: params.unlockedThemesCount,
    totalThemesCount: DEFAULT_SHOP_ITEMS.length,
    favoriteSides,
    memberSince: params.memberSince,
    bySides,
    recentGames: params.recentGames
  };
}

function computeNextStreakInfo(
  streakCount: number,
  lastStreakClaimDate: string | null,
  today: string
): { canClaimStreakToday: boolean; nextStreakDay: number; nextStreakReward: number } {
  const alreadyClaimed = lastStreakClaimDate === today;
  if (alreadyClaimed) {
    const nextDay = (streakCount % 7) + 1;
    return {
      canClaimStreakToday: false,
      nextStreakDay: nextDay,
      nextStreakReward: STREAK_REWARDS[nextDay - 1] ?? 25
    };
  }
  const yesterday = getPreviousUtcDateString(today);
  const nextDay = lastStreakClaimDate === yesterday ? (streakCount % 7) + 1 : 1;
  return {
    canClaimStreakToday: true,
    nextStreakDay: nextDay,
    nextStreakReward: STREAK_REWARDS[nextDay - 1] ?? 25
  };
}

// ============================================================================
// 1. IN-MEMORY STORE (Unit tests & fallback when PostgreSQL is unavailable)
// ============================================================================
const NUMBERED_GUEST_NAME_RE = /^GyroPilot\d+$/i;

function isGenericGuestName(name?: string | null): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return lower === 'gyropilot' || lower === 'hexaplayer';
}

async function generateUniqueGuestName(
  isTaken: (candidate: string) => Promise<boolean> | boolean
): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const candidate = `GyroPilot${10 + crypto.randomInt(0, 990)}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  for (let i = 0; i < 12; i++) {
    const candidate = `GyroPilot${1000 + crypto.randomInt(0, 99000)}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `GyroPilot${Date.now().toString().slice(-6)}`;
}

async function resolveNewGuestDisplayName(
  requestedName: string | undefined,
  isTaken: (candidate: string) => Promise<boolean> | boolean
): Promise<string> {
  const trimmed = requestedName?.trim().slice(0, 32);
  if (!trimmed || isGenericGuestName(trimmed)) {
    return generateUniqueGuestName(isTaken);
  }
  if (NUMBERED_GUEST_NAME_RE.test(trimmed) && (await isTaken(trimmed))) {
    return generateUniqueGuestName(isTaken);
  }
  return trimmed;
}

interface MemUser {
  id: string;
  guestDeviceId: string;
  email: string | null;
  passwordHash: string | null;
  displayName: string;
  avatarUrl: string;
  avatarFrame: string;
  appleSub: string | null;
  googleSub: string | null;
  facebookId: string | null;
  hexaCoins: number;
  streakCount: number;
  lastLoginDate: string | null;
  lastStreakClaimDate: string | null;
  highScoreClassic: number;
  highScoreDaily: number;
  equippedTheme: string;
  unlockedItems: Set<string>;
  isBanned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemPasswordResetToken {
  id: string;
  userId: string;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAtMs: number;
  usedAtMs: number | null;
  createdAtMs: number;
}

export class InMemoryGameStore implements GameStore {
  readonly modeLabel = 'memory' as const;
  private readonly usersById = new Map<string, MemUser>();
  private readonly userIdByDevice = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly scores: StoredScore[] = [];
  private readonly questsByKey = new Map<string, QuestProgressItem[]>();
  private readonly processedAdTransactions = new Set<string>();
  private readonly adminRewardsList: AdminRewardRecord[] = [];
  private readonly siteVisitsByToken = new Map<string, StoredSiteVisit>();
  private readonly passwordResetTokens: MemPasswordResetToken[] = [];
  private adminPasswordHash: string | null = null;

  private toProfile(u: MemUser, today: string): PlayerProfile {
    const streakInfo = computeNextStreakInfo(u.streakCount, u.lastStreakClaimDate, today);
    return {
      id: u.id,
      guestDeviceId: u.guestDeviceId,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl || DEFAULT_AVATAR_URL,
      avatarFrame: u.avatarFrame || DEFAULT_AVATAR_FRAME,
      hexaCoins: u.hexaCoins,
      streakCount: u.streakCount,
      lastStreakClaimDate: u.lastStreakClaimDate,
      highScoreClassic: u.highScoreClassic,
      highScoreDaily: u.highScoreDaily,
      equippedTheme: u.equippedTheme,
      unlockedItems: Array.from(u.unlockedItems),
      banInfo: computeBanInfo(u.isBanned, u.bannedUntil, u.banReason),
      linkedProviders: {
        email: u.email !== null,
        apple: u.appleSub !== null,
        google: u.googleSub !== null,
        facebook: u.facebookId !== null
      },
      ...streakInfo
    };
  }

  private ensureQuests(userId: string, dateStr: string): QuestProgressItem[] {
    const key = `${userId}:${dateStr}`;
    let list = this.questsByKey.get(key);
    if (!list) {
      list = DAILY_QUEST_TEMPLATES.map((tpl) => ({
        questCode: tpl.questCode,
        title: tpl.title,
        target: tpl.target,
        progress: 0,
        rewardCoins: tpl.rewardCoins,
        claimed: false,
        questDate: dateStr
      }));
      this.questsByKey.set(key, list);
    }
    return list;
  }

  private hasDisplayName(candidate: string): boolean {
    const lower = candidate.toLowerCase();
    for (const u of this.usersById.values()) {
      if (u.displayName.toLowerCase() === lower) return true;
    }
    return false;
  }

  async getPlayerByDeviceId(
    deviceId: string,
    today = getUtcDateString()
  ): Promise<PlayerProfile | undefined> {
    const existingId = this.userIdByDevice.get(deviceId);
    if (!existingId) return undefined;
    const user = this.usersById.get(existingId);
    return user ? this.toProfile(user, today) : undefined;
  }

  async getOrCreatePlayer(
    deviceId: string,
    displayName?: string,
    today = getUtcDateString(),
    avatarUrl?: string
  ): Promise<PlayerProfile> {
    const existingId = this.userIdByDevice.get(deviceId);
    if (existingId) {
      const user = this.usersById.get(existingId);
      if (user) {
        user.lastLoginDate = today;
        if (
          displayName &&
          !isGenericGuestName(displayName) &&
          isGenericGuestName(user.displayName)
        ) {
          user.displayName = displayName.trim().slice(0, 32);
        }
        return this.toProfile(user, today);
      }
    }

    const assignedName = await resolveNewGuestDisplayName(displayName, (c) =>
      this.hasDisplayName(c)
    );
    const nowIso = new Date().toISOString();
    const user: MemUser = {
      id: crypto.randomUUID(),
      guestDeviceId: deviceId,
      email: null,
      passwordHash: null,
      displayName: assignedName,
      avatarUrl: avatarUrl || DEFAULT_AVATAR_URL,
      avatarFrame: DEFAULT_AVATAR_FRAME,
      appleSub: null,
      googleSub: null,
      facebookId: null,
      hexaCoins: 100,
      streakCount: 0,
      lastLoginDate: today,
      lastStreakClaimDate: null,
      highScoreClassic: 0,
      highScoreDaily: 0,
      equippedTheme: 'cyberpunk',
      unlockedItems: new Set(['cyberpunk', 'classic']),
      isBanned: false,
      bannedUntil: null,
      banReason: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    this.usersById.set(user.id, user);
    this.userIdByDevice.set(deviceId, user.id);
    return this.toProfile(user, today);
  }

  async getPlayerById(userId: string, today = getUtcDateString()): Promise<PlayerProfile | undefined> {
    const user = this.usersById.get(userId);
    return user ? this.toProfile(user, today) : undefined;
  }

  async updateDisplayName(
    userId: string,
    displayName: string,
    today = getUtcDateString()
  ): Promise<PlayerProfile> {
    return this.updateProfile(userId, { displayName }, today);
  }

  async updateProfile(
    userId: string,
    patch: UpdatePlayerProfilePatch,
    today = getUtcDateString()
  ): Promise<PlayerProfile> {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    if (patch.displayName !== undefined) {
      user.displayName = patch.displayName.trim().slice(0, 32) || 'GyroPilot';
    }
    if (patch.avatarUrl !== undefined) {
      user.avatarUrl = patch.avatarUrl;
    }
    if (patch.avatarFrame !== undefined) {
      user.avatarFrame = patch.avatarFrame;
    }
    user.updatedAt = new Date().toISOString();
    return this.toProfile(user, today);
  }

  async getPlayerPublicIdentities(userIds: string[]): Promise<Map<string, PlayerPublicIdentity>> {
    const map = new Map<string, PlayerPublicIdentity>();
    for (const id of userIds) {
      const user = this.usersById.get(id);
      if (user) {
        map.set(id, {
          displayName: user.displayName,
          avatarUrl: user.avatarUrl || DEFAULT_AVATAR_URL,
          avatarFrame: user.avatarFrame || DEFAULT_AVATAR_FRAME
        });
      }
    }
    return map;
  }

  async getDailySeedInfo(dateStr = getUtcDateString()): Promise<DailySeedInfo> {
    return {
      date: dateStr,
      seed: getDailySeed(dateStr),
      targets: { bronze: 500, silver: 1500, gold: 3000 }
    };
  }

  async createSession(session: StoredSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(sessionId: string): Promise<StoredSession | undefined> {
    return this.sessions.get(sessionId);
  }

  async finalizeVerifiedSession(params: {
    sessionId: string;
    userId: string;
    playerName: string;
    mode: GameMode;
    sides?: PolygonSides;
    score: number;
    maxCombo: number;
    blocksCleared: number;
    coinsEarned: number;
    moveHash: string;
    today?: string;
  }) {
    const today = params.today ?? getUtcDateString();
    const sides = params.sides ?? DEFAULT_SIDES;
    const session = this.sessions.get(params.sessionId);
    if (!session) throw new StoreError(404, 'SESSION_NOT_FOUND', 'Session not found');
    if (session.verified) throw new StoreError(409, 'ALREADY_SUBMITTED', 'Session already submitted');

    session.verified = true;
    session.finalScore = params.score;
    session.submittedAt = new Date().toISOString();

    const user = this.usersById.get(params.userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

    user.displayName = params.playerName;
    user.hexaCoins += params.coinsEarned;
    if (params.mode === 'classic' && params.score > user.highScoreClassic) {
      user.highScoreClassic = params.score;
    } else if (params.mode === 'daily' && params.score > user.highScoreDaily) {
      user.highScoreDaily = params.score;
    }

    const scoreEntry: StoredScore = {
      id: crypto.randomUUID(),
      userId: params.userId,
      sessionId: params.sessionId,
      playerName: params.playerName,
      mode: params.mode,
      sides,
      score: params.score,
      maxCombo: params.maxCombo,
      blocksCleared: params.blocksCleared,
      coinsEarned: params.coinsEarned,
      moveHash: params.moveHash,
      createdAt: new Date().toISOString()
    };
    this.scores.push(scoreEntry);

    const quests = this.ensureQuests(params.userId, today);
    for (const q of quests) {
      if (q.questCode === 'q-blocks') {
        q.progress = Math.min(q.target, q.progress + params.blocksCleared);
      } else if (q.questCode === 'q-combo') {
        q.progress = Math.min(q.target, Math.max(q.progress, params.maxCombo));
      } else if (q.questCode === 'q-score') {
        q.progress = Math.min(q.target, Math.max(q.progress, params.score));
      }
    }

    return {
      scoreEntry,
      player: this.toProfile(user, today),
      quests: quests.map((q) => ({ ...q }))
    };
  }

  async getShopCatalog(userId: string) {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    const items: ShopCatalogItem[] = DEFAULT_SHOP_ITEMS.map((item) => ({
      ...item,
      unlocked: user.unlockedItems.has(item.code),
      equipped: user.equippedTheme === item.code
    }));
    return {
      hexaCoins: user.hexaCoins,
      equippedTheme: user.equippedTheme,
      items
    };
  }

  async purchaseShopItem(userId: string, itemCode: string) {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    const item = DEFAULT_SHOP_ITEMS.find((i) => i.code === itemCode);
    if (!item) throw new StoreError(404, 'ITEM_NOT_FOUND', 'Shop item not found');
    if (user.unlockedItems.has(itemCode)) {
      throw new StoreError(409, 'ALREADY_OWNED', 'Item is already unlocked');
    }
    if (user.hexaCoins < item.price) {
      throw new StoreError(400, 'INSUFFICIENT_COINS', 'Not enough HexaCoins');
    }
    user.hexaCoins -= item.price;
    user.unlockedItems.add(itemCode);
    user.equippedTheme = itemCode;

    return {
      hexaCoins: user.hexaCoins,
      unlockedItems: Array.from(user.unlockedItems),
      equippedTheme: user.equippedTheme
    };
  }

  async equipShopItem(userId: string, itemCode: string) {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    if (!user.unlockedItems.has(itemCode)) {
      throw new StoreError(403, 'ITEM_NOT_OWNED', 'Unlock this theme before equipping');
    }
    user.equippedTheme = itemCode;
    return {
      equippedTheme: user.equippedTheme,
      unlockedItems: Array.from(user.unlockedItems)
    };
  }

  async getDailyQuests(userId: string, dateStr = getUtcDateString()) {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    return this.ensureQuests(userId, dateStr).map((q) => ({ ...q }));
  }

  async claimDailyQuest(userId: string, questCode: string, dateStr = getUtcDateString()) {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    const quests = this.ensureQuests(userId, dateStr);
    const quest = quests.find((q) => q.questCode === questCode);
    if (!quest) throw new StoreError(404, 'QUEST_NOT_FOUND', 'Quest not found');
    if (quest.claimed) throw new StoreError(409, 'QUEST_ALREADY_CLAIMED', 'Quest reward already claimed');
    if (quest.progress < quest.target) {
      throw new StoreError(400, 'QUEST_INCOMPLETE', 'Quest target has not been reached yet');
    }

    quest.claimed = true;
    user.hexaCoins += quest.rewardCoins;
    return {
      quest: { ...quest },
      rewardCoins: quest.rewardCoins,
      hexaCoins: user.hexaCoins
    };
  }

  async claimDailyStreak(userId: string, dateStr = getUtcDateString()): Promise<StreakClaimResult> {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

    if (user.lastStreakClaimDate === dateStr) {
      return {
        claimed: false,
        alreadyClaimed: true,
        streakCount: user.streakCount,
        rewardCoins: 0,
        hexaCoins: user.hexaCoins,
        claimDate: dateStr
      };
    }

    const yesterday = getPreviousUtcDateString(dateStr);
    const nextStreak = user.lastStreakClaimDate === yesterday ? (user.streakCount % 7) + 1 : 1;
    const rewardCoins = STREAK_REWARDS[nextStreak - 1] ?? 25;

    user.streakCount = nextStreak;
    user.lastStreakClaimDate = dateStr;
    user.lastLoginDate = dateStr;
    user.hexaCoins += rewardCoins;

    return {
      claimed: true,
      alreadyClaimed: false,
      streakCount: user.streakCount,
      rewardCoins,
      hexaCoins: user.hexaCoins,
      claimDate: dateStr
    };
  }

  async linkSocialAccount(
    userId: string,
    identity: VerifiedSocialIdentity
  ): Promise<{ player: PlayerProfile; mergedFromUserId?: string }> {
    const today = getUtcDateString();
    const current = this.usersById.get(userId);
    if (!current) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

    const normalizedEmail = identity.email?.trim().toLowerCase() || undefined;

    // Check if another user already owns this social provider sub -> Merge guest progress into target!
    let existingOwner: MemUser | undefined;
    for (const candidate of this.usersById.values()) {
      if (candidate.id === current.id) continue;
      if (
        (identity.provider === 'apple' && candidate.appleSub === identity.providerSub) ||
        (identity.provider === 'google' && candidate.googleSub === identity.providerSub) ||
        (identity.provider === 'facebook' && candidate.facebookId === identity.providerSub)
      ) {
        existingOwner = candidate;
        break;
      }
    }

    if (!existingOwner && normalizedEmail) {
      for (const candidate of this.usersById.values()) {
        if (candidate.id === current.id) continue;
        const slotFree =
          (identity.provider === 'apple' && !candidate.appleSub) ||
          (identity.provider === 'google' && !candidate.googleSub) ||
          (identity.provider === 'facebook' && !candidate.facebookId);
        if (candidate.email === normalizedEmail && slotFree) {
          existingOwner = candidate;
          break;
        }
      }
    }

    if (existingOwner) {
      if (identity.provider === 'apple' && !existingOwner.appleSub) {
        existingOwner.appleSub = identity.providerSub;
      }
      if (identity.provider === 'google' && !existingOwner.googleSub) {
        existingOwner.googleSub = identity.providerSub;
      }
      if (identity.provider === 'facebook' && !existingOwner.facebookId) {
        existingOwner.facebookId = identity.providerSub;
      }
      // Merge coins, high scores, inventory, and sessions from guest -> social account
      existingOwner.hexaCoins += current.hexaCoins;
      existingOwner.highScoreClassic = Math.max(existingOwner.highScoreClassic, current.highScoreClassic);
      existingOwner.highScoreDaily = Math.max(existingOwner.highScoreDaily, current.highScoreDaily);
      for (const item of current.unlockedItems) {
        existingOwner.unlockedItems.add(item);
      }
      for (const sc of this.scores) {
        if (sc.userId === current.id) sc.userId = existingOwner.id;
      }
      for (const sess of this.sessions.values()) {
        if (sess.userId === current.id) sess.userId = existingOwner.id;
      }
      this.userIdByDevice.set(current.guestDeviceId, existingOwner.id);
      this.usersById.delete(current.id);
      return {
        player: this.toProfile(existingOwner, today),
        mergedFromUserId: current.id
      };
    }

    if (identity.provider === 'apple') current.appleSub = identity.providerSub;
    if (identity.provider === 'google') current.googleSub = identity.providerSub;
    if (identity.provider === 'facebook') current.facebookId = identity.providerSub;
    if (identity.displayName && /^GyroPilot\d*$/i.test(current.displayName)) {
      current.displayName = identity.displayName.slice(0, 32);
    }
    if (!current.email && normalizedEmail) {
      let emailTaken = false;
      for (const candidate of this.usersById.values()) {
        if (candidate.id !== current.id && candidate.email === normalizedEmail) {
          emailTaken = true;
          break;
        }
      }
      if (!emailTaken) {
        current.email = normalizedEmail;
      }
    }
    if (
      identity.avatarUrl &&
      isValidAvatarUrl(identity.avatarUrl) &&
      (!current.avatarUrl || current.avatarUrl === DEFAULT_AVATAR_URL)
    ) {
      current.avatarUrl = identity.avatarUrl;
    }

    return { player: this.toProfile(current, today) };
  }

  async deleteUserAccount(userId: string): Promise<{ deleted: boolean; userId: string }> {
    const user = this.usersById.get(userId);
    if (!user) return { deleted: false, userId };

    this.usersById.delete(userId);
    for (const [dev, uid] of this.userIdByDevice.entries()) {
      if (uid === userId) this.userIdByDevice.delete(dev);
    }
    for (const [sid, sess] of this.sessions.entries()) {
      if (sess.userId === userId) this.sessions.delete(sid);
    }
    for (let i = this.scores.length - 1; i >= 0; i--) {
      if (this.scores[i]?.userId === userId) this.scores.splice(i, 1);
    }
    for (const k of Array.from(this.questsByKey.keys())) {
      if (k.startsWith(`${userId}:`)) this.questsByKey.delete(k);
    }
    return { deleted: true, userId };
  }

  async deleteByFacebookId(facebookId: string): Promise<{ deleted: boolean; deletedUserId?: string }> {
    for (const u of this.usersById.values()) {
      if (u.facebookId === facebookId) {
        await this.deleteUserAccount(u.id);
        return { deleted: true, deletedUserId: u.id };
      }
    }
    return { deleted: false };
  }

  async registerEmailAccount(
    userId: string,
    email: string,
    passwordHash: string,
    displayName?: string
  ): Promise<PlayerProfile> {
    const today = getUtcDateString();
    const current = this.usersById.get(userId);
    if (!current) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');

    const normalizedEmail = email.trim().toLowerCase();
    for (const candidate of this.usersById.values()) {
      if (candidate.email === normalizedEmail) {
        throw new StoreError(409, 'EMAIL_ALREADY_EXISTS', 'Bu e-posta adresi zaten kayıtlı.');
      }
    }
    if (current.email !== null) {
      throw new StoreError(409, 'ALREADY_REGISTERED', 'Bu hesap zaten bir e-posta adresine bağlı.');
    }

    current.email = normalizedEmail;
    current.passwordHash = passwordHash;
    if (displayName && displayName.trim().length > 0) {
      current.displayName = displayName.trim().slice(0, 32);
    }
    return this.toProfile(current, today);
  }

  async loginEmailAccount(
    currentUserId: string | undefined,
    email: string,
    password: string,
    verifyFn: (pw: string, hash: string) => boolean
  ): Promise<{ player: PlayerProfile; mergedFromUserId?: string }> {
    const today = getUtcDateString();
    const normalizedEmail = email.trim().toLowerCase();

    let target: MemUser | undefined;
    for (const candidate of this.usersById.values()) {
      if (candidate.email === normalizedEmail) {
        target = candidate;
        break;
      }
    }

    if (!target || !target.passwordHash || !verifyFn(password, target.passwordHash)) {
      throw new StoreError(401, 'INVALID_CREDENTIALS', 'E-posta adresi veya şifre hatalı.');
    }

    if (currentUserId && currentUserId !== target.id) {
      const current = this.usersById.get(currentUserId);
      if (current && !current.email) {
        const extraCoins = Math.max(0, current.hexaCoins - 100);
        target.hexaCoins += extraCoins;
        target.highScoreClassic = Math.max(target.highScoreClassic, current.highScoreClassic);
        target.highScoreDaily = Math.max(target.highScoreDaily, current.highScoreDaily);
        for (const item of current.unlockedItems) {
          target.unlockedItems.add(item);
        }
        for (const sc of this.scores) {
          if (sc.userId === current.id) sc.userId = target.id;
        }
        for (const sess of this.sessions.values()) {
          if (sess.userId === current.id) sess.userId = target.id;
        }
        this.userIdByDevice.set(current.guestDeviceId, target.id);
        this.usersById.delete(current.id);
        return {
          player: this.toProfile(target, today),
          mergedFromUserId: current.id
        };
      }
    }

    return { player: this.toProfile(target, today) };
  }

  async createPasswordResetToken(
    email: string,
    codeHash: string,
    opts: { ttlMinutes?: number; cooldownSeconds?: number } = {}
  ): Promise<{
    created: boolean;
    userId?: string;
    displayName?: string;
    cooldownActive?: boolean;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const nowMs = Date.now();
    const ttlMinutes = opts.ttlMinutes ?? 15;
    const cooldownMs = (opts.cooldownSeconds ?? 60) * 1000;

    let target: MemUser | undefined;
    for (const candidate of this.usersById.values()) {
      if (candidate.email === normalizedEmail) {
        target = candidate;
        break;
      }
    }
    if (!target) {
      return { created: false };
    }

    if (cooldownMs > 0) {
      for (let i = this.passwordResetTokens.length - 1; i >= 0; i -= 1) {
        const tok = this.passwordResetTokens[i];
        if (!tok || tok.email !== normalizedEmail) continue;
        if (tok.usedAtMs === null && tok.expiresAtMs > nowMs && nowMs - tok.createdAtMs < cooldownMs) {
          return { created: false, cooldownActive: true };
        }
        break;
      }
    }

    for (const tok of this.passwordResetTokens) {
      if (tok.email === normalizedEmail && tok.usedAtMs === null) {
        tok.usedAtMs = nowMs;
      }
    }

    this.passwordResetTokens.push({
      id: crypto.randomUUID(),
      userId: target.id,
      email: normalizedEmail,
      codeHash,
      attempts: 0,
      expiresAtMs: nowMs + ttlMinutes * 60_000,
      usedAtMs: null,
      createdAtMs: nowMs
    });

    return {
      created: true,
      userId: target.id,
      displayName: target.displayName
    };
  }

  async consumePasswordResetToken(
    email: string,
    verifyCodeFn: (codeHash: string) => boolean,
    newPasswordHash: string
  ): Promise<PlayerProfile> {
    const normalizedEmail = email.trim().toLowerCase();
    const nowMs = Date.now();
    const today = getUtcDateString();

    let latest: MemPasswordResetToken | undefined;
    for (let i = this.passwordResetTokens.length - 1; i >= 0; i -= 1) {
      const tok = this.passwordResetTokens[i];
      if (tok && tok.email === normalizedEmail && tok.usedAtMs === null) {
        latest = tok;
        break;
      }
    }

    if (!latest || latest.expiresAtMs <= nowMs || latest.attempts >= 5) {
      throw new StoreError(400, 'RESET_CODE_INVALID', 'Doğrulama kodu geçersiz veya süresi dolmuş.');
    }

    if (!verifyCodeFn(latest.codeHash)) {
      latest.attempts += 1;
      if (latest.attempts >= 5) {
        latest.usedAtMs = nowMs;
      }
      throw new StoreError(400, 'RESET_CODE_INVALID', 'Doğrulama kodu geçersiz veya süresi dolmuş.');
    }

    const user = this.usersById.get(latest.userId);
    if (!user) {
      throw new StoreError(400, 'RESET_CODE_INVALID', 'Doğrulama kodu geçersiz veya süresi dolmuş.');
    }

    for (const tok of this.passwordResetTokens) {
      if (tok.email === normalizedEmail && tok.usedAtMs === null) {
        tok.usedAtMs = nowMs;
      }
    }
    user.passwordHash = newPasswordHash;
    return this.toProfile(user, today);
  }

  async grantAdReward(params: {
    transactionId: string;
    userId: string;
    rewardItem: string;
    rewardAmount: number;
    keyId: string;
  }): Promise<{ granted: boolean; duplicate: boolean; hexaCoins: number }> {
    const user = this.usersById.get(params.userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

    if (this.processedAdTransactions.has(params.transactionId)) {
      return { granted: false, duplicate: true, hexaCoins: user.hexaCoins };
    }
    this.processedAdTransactions.add(params.transactionId);
    user.hexaCoins += params.rewardAmount;
    return { granted: true, duplicate: false, hexaCoins: user.hexaCoins };
  }

  async getPlayerStats(userId: string): Promise<PlayerStats> {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

    const userScores = this.scores.filter((s) => s.userId === userId);
    let classicGames = 0;
    let dailyGames = 0;
    let totalBlocksCleared = 0;
    let totalScore = 0;
    let bestScoreClassic = user.highScoreClassic;
    let bestScoreDaily = user.highScoreDaily;
    let bestCombo = 0;
    let totalCoinsEarned = 0;

    const sideMap = new Map<
      PolygonSides,
      { games: number; bestScore: number; blocksCleared: number }
    >();

    for (const sc of userScores) {
      if (sc.mode === 'classic') {
        classicGames += 1;
        if (sc.score > bestScoreClassic) bestScoreClassic = sc.score;
      } else {
        dailyGames += 1;
        if (sc.score > bestScoreDaily) bestScoreDaily = sc.score;
      }
      totalBlocksCleared += sc.blocksCleared;
      totalScore += sc.score;
      if (sc.maxCombo > bestCombo) bestCombo = sc.maxCombo;
      totalCoinsEarned += sc.coinsEarned;

      const s = isSupportedSides(sc.sides) ? sc.sides : DEFAULT_SIDES;
      const cur = sideMap.get(s) ?? { games: 0, bestScore: 0, blocksCleared: 0 };
      cur.games += 1;
      if (sc.score > cur.bestScore) cur.bestScore = sc.score;
      cur.blocksCleared += sc.blocksCleared;
      sideMap.set(s, cur);
    }

    let questsCompleted = 0;
    const prefix = `${userId}:`;
    for (const [key, list] of this.questsByKey.entries()) {
      if (!key.startsWith(prefix)) continue;
      for (const q of list) {
        if (q.claimed) questsCompleted += 1;
      }
    }

    const recentGames: RecentGameItem[] = [...userScores]
      .reverse()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5)
      .map((sc) => ({
        id: sc.id,
        mode: sc.mode,
        sides: isSupportedSides(sc.sides) ? sc.sides : DEFAULT_SIDES,
        score: sc.score,
        maxCombo: sc.maxCombo,
        blocksCleared: sc.blocksCleared,
        coinsEarned: sc.coinsEarned,
        createdAt: sc.createdAt
      }));

    return finalizePlayerStats({
      totalGames: userScores.length,
      classicGames,
      dailyGames,
      totalBlocksCleared,
      totalScore,
      bestScoreClassic,
      bestScoreDaily,
      bestCombo,
      totalCoinsEarned,
      questsCompleted,
      unlockedThemesCount: user.unlockedItems.size,
      memberSince: user.createdAt,
      sideMap,
      recentGames
    });
  }

  async getAdminOverview(): Promise<AdminOverview> {
    const dates = buildLast14UtcDates();
    const today = dates[dates.length - 1] ?? getUtcDateString();
    const nowMs = Date.now();
    const cutoff24hMs = nowMs - 86_400_000;
    const cutoff7dMs = nowMs - 7 * 86_400_000;

    let registeredUsers = 0;
    let guestUsers = 0;
    let bannedUsers = 0;
    let newUsers24h = 0;
    let newUsers7d = 0;
    let totalCoinsInCirculation = 0;
    let paidThemesUnlockedTotal = 0;

    const equippedCounts = new Map<string, number>();
    const unlockedCounts = new Map<string, number>();
    const newUsersByDay = new Map<string, number>();

    for (const u of this.usersById.values()) {
      if (u.email !== null) registeredUsers += 1;
      else guestUsers += 1;
      if (computeBanInfo(u.isBanned, u.bannedUntil, u.banReason).isBanned) {
        bannedUsers += 1;
      }

      const createdMs = Date.parse(u.createdAt);
      if (Number.isFinite(createdMs)) {
        if (createdMs >= cutoff24hMs) newUsers24h += 1;
        if (createdMs >= cutoff7dMs) newUsers7d += 1;
      }
      const createdDay = u.createdAt.slice(0, 10);
      newUsersByDay.set(createdDay, (newUsersByDay.get(createdDay) ?? 0) + 1);

      totalCoinsInCirculation += u.hexaCoins;
      equippedCounts.set(u.equippedTheme, (equippedCounts.get(u.equippedTheme) ?? 0) + 1);
      for (const itemCode of u.unlockedItems) {
        unlockedCounts.set(itemCode, (unlockedCounts.get(itemCode) ?? 0) + 1);
        const itemDef = DEFAULT_SHOP_ITEMS.find((it) => it.code === itemCode);
        if (itemDef && itemDef.price > 0) {
          paidThemesUnlockedTotal += 1;
        }
      }
    }

    let classicGames = 0;
    let dailyGames = 0;
    let gamesToday = 0;
    let games7d = 0;
    let totalBlocksCleared = 0;
    let totalScore = 0;
    let highestScore = 0;
    let highestScorePlayer: string | null = null;
    let bestCombo = 0;
    let totalCoinsEarnedFromGames = 0;

    const activeTodayUsers = new Set<string>();
    const active7dUsers = new Set<string>();
    const gamesByDay = new Map<string, { games: number; players: Set<string> }>();
    const sideAgg = new Map<
      PolygonSides,
      { games: number; totalScore: number; bestScore: number; totalBlocks: number }
    >();

    for (const sc of this.scores) {
      if (sc.mode === 'classic') classicGames += 1;
      else dailyGames += 1;

      totalBlocksCleared += sc.blocksCleared;
      totalScore += sc.score;
      totalCoinsEarnedFromGames += sc.coinsEarned;
      if (sc.maxCombo > bestCombo) bestCombo = sc.maxCombo;
      if (sc.score > highestScore || (sc.score === highestScore && !highestScorePlayer)) {
        highestScore = sc.score;
        highestScorePlayer = sc.playerName;
      }

      const day = sc.createdAt.slice(0, 10);
      const dayEntry = gamesByDay.get(day) ?? { games: 0, players: new Set<string>() };
      dayEntry.games += 1;
      if (sc.userId) dayEntry.players.add(sc.userId);
      gamesByDay.set(day, dayEntry);

      if (day === today) {
        gamesToday += 1;
        if (sc.userId) activeTodayUsers.add(sc.userId);
      }
      const scMs = Date.parse(sc.createdAt);
      if (Number.isFinite(scMs) && scMs >= cutoff7dMs) {
        games7d += 1;
        if (sc.userId) active7dUsers.add(sc.userId);
      }

      const s = isSupportedSides(sc.sides) ? sc.sides : DEFAULT_SIDES;
      const curSide = sideAgg.get(s) ?? { games: 0, totalScore: 0, bestScore: 0, totalBlocks: 0 };
      curSide.games += 1;
      curSide.totalScore += sc.score;
      if (sc.score > curSide.bestScore) curSide.bestScore = sc.score;
      curSide.totalBlocks += sc.blocksCleared;
      sideAgg.set(s, curSide);
    }

    let verifiedSessions = 0;
    for (const sess of this.sessions.values()) {
      if (sess.verified) verifiedSessions += 1;
    }

    let questsCompletedTotal = 0;
    for (const list of this.questsByKey.values()) {
      for (const q of list) {
        if (q.claimed) questsCompletedTotal += 1;
      }
    }

    const totalGames = this.scores.length;
    const totalUsers = this.usersById.size;

    const dailyTrend: AdminDailyPoint[] = dates.map((date) => {
      const g = gamesByDay.get(date);
      return {
        date,
        newUsers: newUsersByDay.get(date) ?? 0,
        games: g?.games ?? 0,
        activePlayers: g?.players.size ?? 0
      };
    });

    const bySides: AdminSideOverview[] = SUPPORTED_SIDES.map((s) => {
      const entry = sideAgg.get(s);
      const games = entry?.games ?? 0;
      return {
        sides: s,
        games,
        averageScore: games > 0 ? Math.round((entry?.totalScore ?? 0) / games) : 0,
        bestScore: entry?.bestScore ?? 0,
        totalBlocksCleared: entry?.totalBlocks ?? 0
      };
    });

    const themes: AdminThemeStat[] = DEFAULT_SHOP_ITEMS.map((item) => ({
      code: item.code,
      name: item.name,
      price: item.price,
      unlockedCount:
        item.price === 0
          ? Math.max(unlockedCounts.get(item.code) ?? 0, totalUsers)
          : unlockedCounts.get(item.code) ?? 0,
      equippedCount: equippedCounts.get(item.code) ?? 0
    }));

    return {
      totalUsers,
      registeredUsers,
      guestUsers,
      bannedUsers,
      newUsers24h,
      newUsers7d,
      activePlayersToday: activeTodayUsers.size,
      activePlayers7d: active7dUsers.size,
      totalGames,
      classicGames,
      dailyGames,
      gamesToday,
      games7d,
      totalSessions: this.sessions.size,
      verifiedSessions,
      totalBlocksCleared,
      totalScore,
      averageScore: totalGames > 0 ? Math.round(totalScore / totalGames) : 0,
      highestScore,
      highestScorePlayer,
      bestCombo,
      totalCoinsInCirculation,
      totalCoinsEarnedFromGames,
      questsCompletedTotal,
      paidThemesUnlockedTotal,
      dailyTrend,
      bySides,
      themes
    };
  }

  async listAdminPlayers(query: AdminPlayerListQuery): Promise<AdminPlayerListResult> {
    const qLower = query.q?.trim().toLowerCase() ?? '';
    const accountType = query.accountType ?? 'all';
    const sort = query.sort ?? 'newest';
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 20));

    const scoreAgg = new Map<
      string,
      { totalGames: number; totalBlocksCleared: number; bestCombo: number; maxScore: number; lastPlayedAt: string | null }
    >();
    for (const sc of this.scores) {
      if (!sc.userId) continue;
      const cur = scoreAgg.get(sc.userId) ?? {
        totalGames: 0,
        totalBlocksCleared: 0,
        bestCombo: 0,
        maxScore: 0,
        lastPlayedAt: null
      };
      cur.totalGames += 1;
      cur.totalBlocksCleared += sc.blocksCleared;
      if (sc.maxCombo > cur.bestCombo) cur.bestCombo = sc.maxCombo;
      if (sc.score > cur.maxScore) cur.maxScore = sc.score;
      if (!cur.lastPlayedAt || sc.createdAt > cur.lastPlayedAt) {
        cur.lastPlayedAt = sc.createdAt;
      }
      scoreAgg.set(sc.userId, cur);
    }

    const filtered: AdminPlayerSummary[] = [];
    for (const u of this.usersById.values()) {
      const isReg = u.email !== null;
      const ban = computeBanInfo(u.isBanned, u.bannedUntil, u.banReason);
      if (accountType === 'registered' && !isReg) continue;
      if (accountType === 'guest' && isReg) continue;
      if (accountType === 'banned' && !ban.isBanned) continue;

      if (qLower) {
        const hay = `${u.displayName} ${u.email ?? ''} ${u.guestDeviceId}`.toLowerCase();
        if (!hay.includes(qLower)) continue;
      }

      const agg = scoreAgg.get(u.id);
      const bestScore = Math.max(u.highScoreClassic, u.highScoreDaily, agg?.maxScore ?? 0);
      filtered.push({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        guestDeviceId: u.guestDeviceId,
        accountType: isReg ? 'registered' : 'guest',
        hexaCoins: u.hexaCoins,
        streakCount: u.streakCount,
        highScoreClassic: u.highScoreClassic,
        highScoreDaily: u.highScoreDaily,
        bestScore,
        equippedTheme: u.equippedTheme,
        unlockedThemesCount: u.unlockedItems.size,
        totalGames: agg?.totalGames ?? 0,
        totalBlocksCleared: agg?.totalBlocksCleared ?? 0,
        bestCombo: agg?.bestCombo ?? 0,
        isBanned: ban.isBanned,
        isPermanentBan: ban.isPermanent,
        bannedUntil: ban.bannedUntil,
        banReason: ban.banReason,
        lastLoginDate: u.lastLoginDate,
        lastPlayedAt: agg?.lastPlayedAt ?? null,
        createdAt: u.createdAt
      });
    }

    filtered.sort((a, b) => {
      switch (sort) {
        case 'best_score':
          return b.bestScore - a.bestScore || b.createdAt.localeCompare(a.createdAt);
        case 'most_games':
          return b.totalGames - a.totalGames || b.createdAt.localeCompare(a.createdAt);
        case 'most_coins':
          return b.hexaCoins - a.hexaCoins || b.createdAt.localeCompare(a.createdAt);
        case 'last_active': {
          const at = a.lastPlayedAt ?? a.createdAt;
          const bt = b.lastPlayedAt ?? b.createdAt;
          return bt.localeCompare(at);
        }
        case 'newest':
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.max(1, Math.min(totalPages, query.page ?? 1));
    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages
    };
  }

  async getAdminPlayerDetail(userId: string): Promise<AdminPlayerDetail | undefined> {
    const today = getUtcDateString();
    const user = this.usersById.get(userId);
    if (!user) return undefined;

    const stats = await this.getPlayerStats(userId);
    const quests = this.ensureQuests(userId, today).map((q) => ({ ...q }));
    const recentGames: RecentGameItem[] = this.scores
      .filter((s) => s.userId === userId)
      .reverse()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 15)
      .map((sc) => ({
        id: sc.id,
        mode: sc.mode,
        sides: isSupportedSides(sc.sides) ? sc.sides : DEFAULT_SIDES,
        score: sc.score,
        maxCombo: sc.maxCombo,
        blocksCleared: sc.blocksCleared,
        coinsEarned: sc.coinsEarned,
        createdAt: sc.createdAt
      }));

    const userVisits = Array.from(this.siteVisitsByToken.values()).filter(
      (v) => v.userId === userId
    );
    const visitSummary = buildPlayerVisitSummary(userVisits);

    return {
      player: this.toProfile(user, today),
      stats,
      quests,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginDate: user.lastLoginDate,
      recentGames,
      visitSummary
    };
  }

  async updateAdminPlayer(
    userId: string,
    patch: AdminUpdatePlayerInput
  ): Promise<AdminPlayerDetail> {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');

    if (patch.unlockThemeCode !== undefined) {
      const valid = DEFAULT_SHOP_ITEMS.some((it) => it.code === patch.unlockThemeCode);
      if (!valid) throw new StoreError(400, 'INVALID_THEME', 'Geçersiz tema kodu.');
      user.unlockedItems.add(patch.unlockThemeCode);
    }

    if (patch.equippedTheme !== undefined) {
      const valid = DEFAULT_SHOP_ITEMS.some((it) => it.code === patch.equippedTheme);
      if (!valid) throw new StoreError(400, 'INVALID_THEME', 'Geçersiz tema kodu.');
      user.unlockedItems.add(patch.equippedTheme);
      user.equippedTheme = patch.equippedTheme;
    }

    if (patch.displayName !== undefined) {
      const trimmed = patch.displayName.trim().slice(0, 32);
      if (trimmed.length > 0) user.displayName = trimmed;
    }

    if (patch.hexaCoins !== undefined) {
      user.hexaCoins = Math.max(0, Math.floor(patch.hexaCoins));
    } else if (patch.coinsDelta !== undefined) {
      user.hexaCoins = Math.max(0, user.hexaCoins + Math.floor(patch.coinsDelta));
    }

    if (patch.streakCount !== undefined) {
      user.streakCount = Math.max(0, Math.min(365, Math.floor(patch.streakCount)));
    }

    user.updatedAt = new Date().toISOString();
    const detail = await this.getAdminPlayerDetail(userId);
    if (!detail) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    return detail;
  }

  async listAdminScores(query: AdminScoreListQuery): Promise<AdminScoreListResult> {
    const qLower = query.q?.trim().toLowerCase() ?? '';
    const mode = query.mode ?? 'all';
    const sort = query.sort ?? 'newest';
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25));

    const items: AdminScoreItem[] = [];
    for (let i = this.scores.length - 1; i >= 0; i--) {
      const sc = this.scores[i];
      if (!sc) continue;
      if (mode !== 'all' && sc.mode !== mode) continue;
      const scSides = isSupportedSides(sc.sides) ? sc.sides : DEFAULT_SIDES;
      if (query.sides !== undefined && scSides !== query.sides) continue;

      const owner = this.usersById.get(sc.userId);
      const userEmail = owner?.email ?? null;
      if (qLower) {
        const hay = `${sc.playerName} ${userEmail ?? ''}`.toLowerCase();
        if (!hay.includes(qLower)) continue;
      }

      items.push({
        id: sc.id,
        sessionId: sc.sessionId,
        userId: sc.userId,
        playerName: sc.playerName,
        userEmail,
        mode: sc.mode,
        sides: scSides,
        score: sc.score,
        maxCombo: sc.maxCombo,
        blocksCleared: sc.blocksCleared,
        coinsEarned: sc.coinsEarned,
        moveHash: sc.moveHash,
        createdAt: sc.createdAt
      });
    }

    items.sort((a, b) => {
      switch (sort) {
        case 'score':
          return b.score - a.score || b.createdAt.localeCompare(a.createdAt);
        case 'blocks':
          return b.blocksCleared - a.blocksCleared || b.createdAt.localeCompare(a.createdAt);
        case 'combo':
          return b.maxCombo - a.maxCombo || b.createdAt.localeCompare(a.createdAt);
        case 'newest':
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.max(1, Math.min(totalPages, query.page ?? 1));
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages
    };
  }

  async deleteAdminScore(scoreId: string): Promise<{ deleted: boolean; userId?: string }> {
    const idx = this.scores.findIndex((s) => s.id === scoreId);
    if (idx < 0) return { deleted: false };
    const removed = this.scores[idx]!;
    this.scores.splice(idx, 1);

    const user = this.usersById.get(removed.userId);
    if (user) {
      let bestClassic = 0;
      let bestDaily = 0;
      for (const sc of this.scores) {
        if (sc.userId !== user.id) continue;
        if (sc.mode === 'classic' && sc.score > bestClassic) bestClassic = sc.score;
        if (sc.mode === 'daily' && sc.score > bestDaily) bestDaily = sc.score;
      }
      user.highScoreClassic = bestClassic;
      user.highScoreDaily = bestDaily;
      user.updatedAt = new Date().toISOString();
    }

    return { deleted: true, userId: removed.userId };
  }

  async banPlayer(
    userId: string,
    input: { durationHours?: number | null; reason?: string }
  ): Promise<AdminPlayerDetail> {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');

    user.isBanned = true;
    user.bannedUntil =
      input.durationHours && input.durationHours > 0
        ? new Date(Date.now() + input.durationHours * 3600_000).toISOString()
        : null;
    user.banReason = input.reason?.trim() ? input.reason.trim() : null;
    user.updatedAt = new Date().toISOString();

    const detail = await this.getAdminPlayerDetail(userId);
    if (!detail) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    return detail;
  }

  async unbanPlayer(userId: string): Promise<AdminPlayerDetail> {
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');

    user.isBanned = false;
    user.bannedUntil = null;
    user.banReason = null;
    user.updatedAt = new Date().toISOString();

    const detail = await this.getAdminPlayerDetail(userId);
    if (!detail) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    return detail;
  }

  async grantAdminReward(input: AdminGrantRewardInput): Promise<AdminGrantRewardResult> {
    const coins = Math.max(0, Math.floor(input.coinsAmount ?? 0));
    const themeCode = input.themeCode?.trim() || null;
    if (coins <= 0 && !themeCode) {
      throw new StoreError(400, 'EMPTY_REWARD', 'En az coin veya tema ödülü belirtmelisin.');
    }
    if (themeCode && !DEFAULT_SHOP_ITEMS.some((it) => it.code === themeCode)) {
      throw new StoreError(400, 'INVALID_THEME', 'Geçersiz tema kodu.');
    }

    const nowIso = new Date().toISOString();
    let targets: MemUser[] = [];
    let recipientName = '';
    let userId: string | null = null;

    if (input.scope === 'single') {
      if (!input.userId) {
        throw new StoreError(400, 'USER_REQUIRED', 'Tekil ödül için oyuncu seçmelisin.');
      }
      const target = this.usersById.get(input.userId);
      if (!target) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
      targets = [target];
      recipientName = target.displayName;
      userId = target.id;
    } else if (input.scope === 'registered') {
      targets = Array.from(this.usersById.values()).filter((u) => u.email !== null);
      recipientName = 'Tüm Kayıtlı Oyuncular';
    } else {
      targets = Array.from(this.usersById.values());
      recipientName = 'Tüm Oyuncular';
    }

    for (const u of targets) {
      u.hexaCoins += coins;
      if (themeCode) u.unlockedItems.add(themeCode);
      u.updatedAt = nowIso;
    }

    const reward: AdminRewardRecord = {
      id: crypto.randomUUID(),
      userId,
      recipientName,
      scope: input.scope,
      coinsAmount: coins,
      themeCode,
      reason: input.reason?.trim() ?? '',
      createdAt: nowIso
    };
    this.adminRewardsList.unshift(reward);

    const playerDetail =
      input.scope === 'single' && userId ? await this.getAdminPlayerDetail(userId) : undefined;

    return {
      affectedCount: targets.length,
      reward,
      playerDetail
    };
  }

  async listAdminRewards(limit = 50): Promise<AdminRewardRecord[]> {
    return this.adminRewardsList.slice(0, Math.max(1, limit));
  }

  async getAdminPasswordHash(): Promise<string | null> {
    return this.adminPasswordHash;
  }

  async setAdminPasswordHash(passwordHash: string): Promise<void> {
    this.adminPasswordHash = passwordHash;
  }

  async recordSiteVisit(input: RecordVisitInput): Promise<void> {
    let resolvedUserId = input.userId ?? null;
    if (!resolvedUserId && input.deviceId) {
      resolvedUserId = this.userIdByDevice.get(input.deviceId) ?? null;
    }

    const nowIso = new Date().toISOString();
    const existing = this.siteVisitsByToken.get(input.visitToken);
    if (existing) {
      existing.lastSeenAt = nowIso;
      if (!existing.userId && resolvedUserId) existing.userId = resolvedUserId;
      if (!existing.deviceId && input.deviceId) existing.deviceId = input.deviceId;
      return;
    }

    this.siteVisitsByToken.set(input.visitToken, {
      id: crypto.randomUUID(),
      visitToken: input.visitToken,
      userId: resolvedUserId,
      deviceId: input.deviceId ?? null,
      visitorHash: input.visitorHash,
      isReturning: input.isReturning,
      landingPath: input.landingPath || '/',
      referrerUrl: input.referrerUrl,
      referrerHost: input.referrerHost,
      sourceCategory: input.sourceCategory,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      countryCode: input.countryCode,
      region: input.region,
      city: input.city,
      continent: input.continent,
      timezone: input.timezone,
      language: input.language,
      deviceType: input.deviceType,
      osName: input.osName,
      osVersion: input.osVersion,
      browserName: input.browserName,
      browserVersion: input.browserVersion,
      appMode: input.appMode,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      connectionType: input.connectionType,
      siteDurationSec: 0,
      playDurationSec: 0,
      gamesStarted: 0,
      gamesCompleted: 0,
      bestScore: 0,
      lastMode: null,
      lastSides: null,
      lastLayout: null,
      isPlayingNow: false,
      startedAt: nowIso,
      lastSeenAt: nowIso
    });
  }

  async recordSiteHeartbeat(input: RecordHeartbeatInput): Promise<void> {
    const existing = this.siteVisitsByToken.get(input.visitToken);
    if (!existing) return;

    if (!existing.userId) {
      if (input.userId) existing.userId = input.userId;
      else if (input.deviceId) existing.userId = this.userIdByDevice.get(input.deviceId) ?? null;
    }

    const durations = clampVisitDurations(
      existing.startedAt,
      existing.siteDurationSec,
      existing.playDurationSec,
      input.siteDurationSec,
      input.playDurationSec
    );
    existing.siteDurationSec = durations.siteDurationSec;
    existing.playDurationSec = durations.playDurationSec;
    existing.gamesStarted = Math.max(existing.gamesStarted, Math.floor(input.gamesStarted));
    existing.gamesCompleted = Math.max(existing.gamesCompleted, Math.floor(input.gamesCompleted));
    existing.bestScore = Math.max(existing.bestScore, Math.floor(input.bestScore));
    existing.isPlayingNow = input.isPlayingNow;
    if (input.lastMode) existing.lastMode = input.lastMode;
    if (input.lastSides) existing.lastSides = input.lastSides;
    if (input.lastLayout) existing.lastLayout = input.lastLayout;
    existing.lastSeenAt = new Date().toISOString();
  }

  async getAdminAnalytics(query: AdminAnalyticsQuery): Promise<AdminAnalyticsReport> {
    const now = new Date();
    const { from } = resolveAnalyticsWindow(query.range, now);
    const fromMs = from ? from.getTime() : 0;

    const allRangeVisits: StoredSiteVisit[] = [];
    for (const v of this.siteVisitsByToken.values()) {
      if (from && new Date(v.startedAt).getTime() < fromMs) continue;
      const owner = v.userId ? this.usersById.get(v.userId) : undefined;
      allRangeVisits.push({
        ...v,
        playerName: owner?.displayName ?? null,
        playerEmail: owner?.email ?? null
      });
    }

    const filtered = filterAnalyticsVisits(allRangeVisits, query);
    return aggregateVisitsReport(allRangeVisits, filtered, query, now);
  }
}

function clampVisitDurations(
  startedAtIso: string,
  prevSiteSec: number,
  prevPlaySec: number,
  claimedSiteSec: number,
  claimedPlaySec: number,
  nowMs = Date.now()
): { siteDurationSec: number; playDurationSec: number } {
  const elapsedSec = Math.max(0, Math.ceil((nowMs - new Date(startedAtIso).getTime()) / 1000));
  const maxAllowedSec = Math.max(60, elapsedSec + 30);
  const clampedSite = Math.min(Math.max(0, Math.floor(claimedSiteSec)), maxAllowedSec);
  const siteDurationSec = Math.max(prevSiteSec, clampedSite);
  const clampedPlay = Math.min(
    Math.max(0, Math.floor(claimedPlaySec)),
    siteDurationSec,
    maxAllowedSec
  );
  const playDurationSec = Math.max(prevPlaySec, clampedPlay);
  return { siteDurationSec, playDurationSec };
}

function filterAnalyticsVisits(
  visits: StoredSiteVisit[],
  query: AdminAnalyticsQuery
): StoredSiteVisit[] {
  const countryFilter =
    query.country && query.country !== 'all' ? query.country.toUpperCase() : null;
  const deviceFilter =
    query.deviceType && query.deviceType !== 'all' ? query.deviceType : null;
  const sourceFilter = query.source && query.source !== 'all' ? query.source : null;
  return visits.filter((v) => {
    if (countryFilter && v.countryCode.toUpperCase() !== countryFilter) return false;
    if (deviceFilter && v.deviceType !== deviceFilter) return false;
    if (sourceFilter && v.sourceCategory !== sourceFilter) return false;
    return true;
  });
}

function mapPgVisitRow(
  row: typeof schema.siteVisits.$inferSelect,
  playerName: string | null = null,
  playerEmail: string | null = null
): StoredSiteVisit {
  const srcCat =
    row.sourceCategory === 'direct' ||
    row.sourceCategory === 'search' ||
    row.sourceCategory === 'social' ||
    row.sourceCategory === 'campaign'
      ? row.sourceCategory
      : 'referral';
  const devType =
    row.deviceType === 'mobile' || row.deviceType === 'tablet' ? row.deviceType : 'desktop';
  const appMode =
    row.appMode === 'pwa' || row.appMode === 'native' ? row.appMode : 'browser';

  return {
    id: row.id,
    visitToken: row.visitToken,
    userId: row.userId,
    playerName,
    playerEmail,
    deviceId: row.deviceId,
    visitorHash: row.visitorHash,
    isReturning: row.isReturning,
    landingPath: row.landingPath,
    referrerUrl: row.referrerUrl,
    referrerHost: row.referrerHost,
    sourceCategory: srcCat,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    countryCode: row.countryCode,
    region: row.region,
    city: row.city,
    continent: row.continent,
    timezone: row.timezone,
    language: row.language,
    deviceType: devType,
    osName: row.osName,
    osVersion: row.osVersion,
    browserName: row.browserName,
    browserVersion: row.browserVersion,
    appMode,
    screenWidth: row.screenWidth,
    screenHeight: row.screenHeight,
    viewportWidth: row.viewportWidth,
    viewportHeight: row.viewportHeight,
    connectionType: row.connectionType,
    siteDurationSec: row.siteDurationSec,
    playDurationSec: row.playDurationSec,
    gamesStarted: row.gamesStarted,
    gamesCompleted: row.gamesCompleted,
    bestScore: row.bestScore,
    lastMode: row.lastMode,
    lastSides: row.lastSides,
    lastLayout: row.lastLayout,
    isPlayingNow: row.isPlayingNow,
    startedAt: row.startedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString()
  };
}

// ============================================================================
// 2. POSTGRESQL + DRIZZLE ORM PERSISTENT REPOSITORY
// ============================================================================
export class PostgresGameStore implements GameStore {
  readonly modeLabel = 'postgres' as const;
  private readonly pool: Pool;
  private readonly db: NodePgDatabase<typeof schema>;

  constructor(pool: Pool) {
    this.pool = pool;
    this.db = drizzle(pool, { schema });
  }

  private async getUnlockedCodes(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ itemCode: schema.userInventory.itemCode })
      .from(schema.userInventory)
      .where(eq(schema.userInventory.userId, userId));
    const set = new Set<string>(['classic', 'cyberpunk', ...rows.map((r) => r.itemCode)]);
    return Array.from(set);
  }

  private async hydrateProfile(
    row: typeof schema.users.$inferSelect,
    today: string
  ): Promise<PlayerProfile> {
    const unlockedItems = await this.getUnlockedCodes(row.id);
    const streakInfo = computeNextStreakInfo(row.streakCount, row.lastStreakClaimDate, today);
    return {
      id: row.id,
      guestDeviceId: row.guestDeviceId ?? row.id,
      email: row.email ?? null,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl || DEFAULT_AVATAR_URL,
      avatarFrame: row.avatarFrame || DEFAULT_AVATAR_FRAME,
      hexaCoins: row.hexaCoins,
      streakCount: row.streakCount,
      lastStreakClaimDate: row.lastStreakClaimDate,
      highScoreClassic: row.highScoreClassic,
      highScoreDaily: row.highScoreDaily,
      equippedTheme: row.equippedTheme,
      unlockedItems,
      banInfo: computeBanInfo(row.isBanned, row.bannedUntil, row.banReason),
      linkedProviders: {
        email: row.email !== null,
        apple: row.appleSub !== null,
        google: row.googleSub !== null,
        facebook: row.facebookId !== null
      },
      ...streakInfo
    };
  }

  private async ensureDefaultShopSeeded(): Promise<void> {
    for (const item of DEFAULT_SHOP_ITEMS) {
      await this.db
        .insert(schema.shopItems)
        .values({
          code: item.code,
          name: item.name,
          subtitle: item.subtitle,
          category: item.category,
          price: item.price,
          sortOrder: item.sortOrder,
          active: true
        })
        .onConflictDoUpdate({
          target: schema.shopItems.code,
          set: {
            name: item.name,
            subtitle: item.subtitle,
            category: item.category,
            price: item.price,
            sortOrder: item.sortOrder,
            active: true
          }
        });
    }
  }

  private async ensureQuestsRows(userId: string, dateStr: string): Promise<QuestProgressItem[]> {
    for (const tpl of DAILY_QUEST_TEMPLATES) {
      await this.db
        .insert(schema.userQuests)
        .values({
          userId,
          questDate: dateStr,
          questCode: tpl.questCode,
          title: tpl.title,
          target: tpl.target,
          progress: 0,
          rewardCoins: tpl.rewardCoins,
          claimed: false
        })
        .onConflictDoNothing();
    }

    const rows = await this.db
      .select()
      .from(schema.userQuests)
      .where(and(eq(schema.userQuests.userId, userId), eq(schema.userQuests.questDate, dateStr)))
      .orderBy(asc(schema.userQuests.questCode));

    return rows.map((r) => ({
      questCode: r.questCode,
      title: r.title,
      target: r.target,
      progress: r.progress,
      rewardCoins: r.rewardCoins,
      claimed: r.claimed,
      questDate: r.questDate
    }));
  }

  private async hasDisplayName(candidate: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`LOWER(${schema.users.displayName}) = LOWER(${candidate})`)
      .limit(1);
    return rows.length > 0;
  }

  async getPlayerByDeviceId(
    deviceId: string,
    today = getUtcDateString()
  ): Promise<PlayerProfile | undefined> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.guestDeviceId, deviceId))
      .limit(1);
    return rows[0] ? this.hydrateProfile(rows[0], today) : undefined;
  }

  async getOrCreatePlayer(
    deviceId: string,
    displayName?: string,
    today = getUtcDateString(),
    avatarUrl?: string
  ): Promise<PlayerProfile> {
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.guestDeviceId, deviceId))
      .limit(1);

    if (existing[0]) {
      let currentRow = existing[0];
      if (
        displayName &&
        !isGenericGuestName(displayName) &&
        isGenericGuestName(currentRow.displayName)
      ) {
        const cleanName = displayName.trim().slice(0, 32);
        const [updated] = await this.db
          .update(schema.users)
          .set({ displayName: cleanName, updatedAt: new Date() })
          .where(eq(schema.users.id, currentRow.id))
          .returning();
        if (updated) currentRow = updated;
      }
      return this.hydrateProfile(currentRow, today);
    }

    await this.ensureDefaultShopSeeded();
    const assignedName = await resolveNewGuestDisplayName(displayName, (c) =>
      this.hasDisplayName(c)
    );
    const [created] = await this.db
      .insert(schema.users)
      .values({
        guestDeviceId: deviceId,
        displayName: assignedName,
        avatarUrl: avatarUrl || DEFAULT_AVATAR_URL,
        avatarFrame: DEFAULT_AVATAR_FRAME,
        hexaCoins: 100,
        lastLoginDate: today,
        equippedTheme: 'cyberpunk'
      })
      .onConflictDoNothing({ target: schema.users.guestDeviceId })
      .returning();

    const row =
      created ??
      (
        await this.db
          .select()
          .from(schema.users)
          .where(eq(schema.users.guestDeviceId, deviceId))
          .limit(1)
      )[0];

    if (!row) {
      throw new StoreError(500, 'USER_CREATE_FAILED', 'Could not create player');
    }

    await this.db
      .insert(schema.userInventory)
      .values([
        { userId: row.id, itemCode: 'cyberpunk' },
        { userId: row.id, itemCode: 'classic' }
      ])
      .onConflictDoNothing();

    return this.hydrateProfile(row, today);
  }

  async getPlayerById(userId: string, today = getUtcDateString()): Promise<PlayerProfile | undefined> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return rows[0] ? this.hydrateProfile(rows[0], today) : undefined;
  }

  async updateDisplayName(
    userId: string,
    displayName: string,
    today = getUtcDateString()
  ): Promise<PlayerProfile> {
    return this.updateProfile(userId, { displayName }, today);
  }

  async updateProfile(
    userId: string,
    patch: UpdatePlayerProfilePatch,
    today = getUtcDateString()
  ): Promise<PlayerProfile> {
    const updateSet: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date()
    };
    if (patch.displayName !== undefined) {
      updateSet.displayName = patch.displayName.trim().slice(0, 32) || 'GyroPilot';
    }
    if (patch.avatarUrl !== undefined) {
      updateSet.avatarUrl = patch.avatarUrl;
    }
    if (patch.avatarFrame !== undefined) {
      updateSet.avatarFrame = patch.avatarFrame;
    }

    const [updated] = await this.db
      .update(schema.users)
      .set(updateSet)
      .where(eq(schema.users.id, userId))
      .returning();

    if (!updated) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    return this.hydrateProfile(updated, today);
  }

  async getPlayerPublicIdentities(userIds: string[]): Promise<Map<string, PlayerPublicIdentity>> {
    const map = new Map<string, PlayerPublicIdentity>();
    const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
    if (uniqueIds.length === 0) return map;

    // Seed showcase IDs use non-UUID strings (e.g. 'seed-nova'); guard Postgres uuid column cast
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUuids = uniqueIds.filter((id) => uuidRe.test(id));
    if (validUuids.length === 0) return map;

    const rows = await this.db
      .select({
        id: schema.users.id,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
        avatarFrame: schema.users.avatarFrame
      })
      .from(schema.users)
      .where(inArray(schema.users.id, validUuids));

    for (const r of rows) {
      map.set(r.id, {
        displayName: r.displayName,
        avatarUrl: r.avatarUrl || DEFAULT_AVATAR_URL,
        avatarFrame: r.avatarFrame || DEFAULT_AVATAR_FRAME
      });
    }
    return map;
  }

  async getDailySeedInfo(dateStr = getUtcDateString()): Promise<DailySeedInfo> {
    const existing = await this.db
      .select()
      .from(schema.dailySeeds)
      .where(eq(schema.dailySeeds.date, dateStr))
      .limit(1);

    if (existing[0]) {
      return {
        date: existing[0].date,
        seed: existing[0].seed,
        targets: {
          bronze: existing[0].targetBronze,
          silver: existing[0].targetSilver,
          gold: existing[0].targetGold
        }
      };
    }

    const seed = getDailySeed(dateStr);
    await this.db
      .insert(schema.dailySeeds)
      .values({ date: dateStr, seed, targetBronze: 500, targetSilver: 1500, targetGold: 3000 })
      .onConflictDoNothing({ target: schema.dailySeeds.date });

    return { date: dateStr, seed, targets: { bronze: 500, silver: 1500, gold: 3000 } };
  }

  async createSession(session: StoredSession): Promise<void> {
    await this.db.insert(schema.gameSessions).values({
      id: session.id,
      userId: session.userId,
      mode: session.mode,
      sides: session.sides ?? DEFAULT_SIDES,
      seed: session.seed,
      signature: session.signature,
      playerName: session.playerName,
      verified: false
    });
  }

  async getSession(sessionId: string): Promise<StoredSession | undefined> {
    const rows = await this.db
      .select()
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.id, sessionId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.userId ?? '',
      mode: row.mode as GameMode,
      sides: (row.sides as PolygonSides) ?? DEFAULT_SIDES,
      seed: row.seed,
      signature: row.signature,
      playerName: row.playerName,
      verified: row.verified,
      finalScore: row.finalScore,
      startedAt: row.startedAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString()
    };
  }

  async finalizeVerifiedSession(params: {
    sessionId: string;
    userId: string;
    playerName: string;
    mode: GameMode;
    sides?: PolygonSides;
    score: number;
    maxCombo: number;
    blocksCleared: number;
    coinsEarned: number;
    moveHash: string;
    today?: string;
  }) {
    const today = params.today ?? getUtcDateString();
    const sides = params.sides ?? DEFAULT_SIDES;

    const [updatedSession] = await this.db
      .update(schema.gameSessions)
      .set({ verified: true, finalScore: params.score, submittedAt: new Date() })
      .where(and(eq(schema.gameSessions.id, params.sessionId), eq(schema.gameSessions.verified, false)))
      .returning();

    if (!updatedSession) {
      throw new StoreError(409, 'ALREADY_SUBMITTED', 'Session already submitted or missing');
    }

    const [insertedScore] = await this.db
      .insert(schema.scores)
      .values({
        userId: params.userId,
        sessionId: params.sessionId,
        playerName: params.playerName,
        mode: params.mode,
        sides,
        score: params.score,
        maxCombo: params.maxCombo,
        blocksCleared: params.blocksCleared,
        coinsEarned: params.coinsEarned,
        moveHash: params.moveHash
      })
      .returning();

    const [updatedUser] = await this.db
      .update(schema.users)
      .set({
        displayName: params.playerName,
        hexaCoins: sql`${schema.users.hexaCoins} + ${params.coinsEarned}`,
        highScoreClassic:
          params.mode === 'classic'
            ? sql`GREATEST(${schema.users.highScoreClassic}, ${params.score})`
            : schema.users.highScoreClassic,
        highScoreDaily:
          params.mode === 'daily'
            ? sql`GREATEST(${schema.users.highScoreDaily}, ${params.score})`
            : schema.users.highScoreDaily,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, params.userId))
      .returning();

    if (!updatedUser || !insertedScore) {
      throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    }

    // Ensure & advance daily quests
    await this.ensureQuestsRows(params.userId, today);
    await this.db
      .update(schema.userQuests)
      .set({
        progress: sql`LEAST(${schema.userQuests.target}, ${schema.userQuests.progress} + ${params.blocksCleared})`
      })
      .where(
        and(
          eq(schema.userQuests.userId, params.userId),
          eq(schema.userQuests.questDate, today),
          eq(schema.userQuests.questCode, 'q-blocks')
        )
      );

    await this.db
      .update(schema.userQuests)
      .set({
        progress: sql`LEAST(${schema.userQuests.target}, GREATEST(${schema.userQuests.progress}, ${params.maxCombo}))`
      })
      .where(
        and(
          eq(schema.userQuests.userId, params.userId),
          eq(schema.userQuests.questDate, today),
          eq(schema.userQuests.questCode, 'q-combo')
        )
      );

    await this.db
      .update(schema.userQuests)
      .set({
        progress: sql`LEAST(${schema.userQuests.target}, GREATEST(${schema.userQuests.progress}, ${params.score}))`
      })
      .where(
        and(
          eq(schema.userQuests.userId, params.userId),
          eq(schema.userQuests.questDate, today),
          eq(schema.userQuests.questCode, 'q-score')
        )
      );

    const quests = await this.ensureQuestsRows(params.userId, today);
    const player = await this.hydrateProfile(updatedUser, today);

    return {
      scoreEntry: {
        id: insertedScore.id,
        userId: params.userId,
        sessionId: params.sessionId,
        playerName: insertedScore.playerName,
        mode: insertedScore.mode as GameMode,
        sides: (insertedScore.sides as PolygonSides) ?? sides,
        score: insertedScore.score,
        maxCombo: insertedScore.maxCombo,
        blocksCleared: insertedScore.blocksCleared,
        coinsEarned: insertedScore.coinsEarned,
        moveHash: insertedScore.moveHash,
        createdAt: insertedScore.createdAt.toISOString()
      },
      player,
      quests
    };
  }

  async getShopCatalog(userId: string) {
    await this.ensureDefaultShopSeeded();
    const userRows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

    const catalogRows = await this.db
      .select()
      .from(schema.shopItems)
      .where(eq(schema.shopItems.active, true))
      .orderBy(asc(schema.shopItems.sortOrder));

    const unlocked = new Set(await this.getUnlockedCodes(userId));
    return {
      hexaCoins: user.hexaCoins,
      equippedTheme: user.equippedTheme,
      items: catalogRows.map((row) => ({
        code: row.code,
        name: row.name,
        subtitle: row.subtitle,
        category: row.category as 'theme',
        price: row.price,
        sortOrder: row.sortOrder,
        unlocked: unlocked.has(row.code),
        equipped: user.equippedTheme === row.code
      }))
    };
  }

  async purchaseShopItem(userId: string, itemCode: string) {
    await this.ensureDefaultShopSeeded();
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(schema.shopItems)
        .where(eq(schema.shopItems.code, itemCode))
        .limit(1);
      if (!item) throw new StoreError(404, 'ITEM_NOT_FOUND', 'Shop item not found');

      const [user] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

      const owned = await tx
        .select()
        .from(schema.userInventory)
        .where(and(eq(schema.userInventory.userId, userId), eq(schema.userInventory.itemCode, itemCode)))
        .limit(1);
      if (owned[0] || itemCode === 'classic' || itemCode === 'cyberpunk') {
        throw new StoreError(409, 'ALREADY_OWNED', 'Item is already unlocked');
      }

      if (user.hexaCoins < item.price) {
        throw new StoreError(400, 'INSUFFICIENT_COINS', 'Not enough HexaCoins');
      }

      const [updated] = await tx
        .update(schema.users)
        .set({
          hexaCoins: sql`${schema.users.hexaCoins} - ${item.price}`,
          equippedTheme: itemCode,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId))
        .returning();

      await tx.insert(schema.userInventory).values({ userId, itemCode }).onConflictDoNothing();

      const inv = await tx
        .select({ itemCode: schema.userInventory.itemCode })
        .from(schema.userInventory)
        .where(eq(schema.userInventory.userId, userId));

      return {
        hexaCoins: updated?.hexaCoins ?? user.hexaCoins - item.price,
        unlockedItems: Array.from(new Set(['classic', 'cyberpunk', ...inv.map((r) => r.itemCode)])),
        equippedTheme: itemCode
      };
    });
  }

  async equipShopItem(userId: string, itemCode: string) {
    const unlocked = await this.getUnlockedCodes(userId);
    if (!unlocked.includes(itemCode)) {
      throw new StoreError(403, 'ITEM_NOT_OWNED', 'Unlock this theme before equipping');
    }

    const [updated] = await this.db
      .update(schema.users)
      .set({ equippedTheme: itemCode, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();

    if (!updated) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    return { equippedTheme: updated.equippedTheme, unlockedItems: unlocked };
  }

  async getDailyQuests(userId: string, dateStr = getUtcDateString()) {
    return this.ensureQuestsRows(userId, dateStr);
  }

  async claimDailyQuest(userId: string, questCode: string, dateStr = getUtcDateString()) {
    return this.db.transaction(async (tx) => {
      const [quest] = await tx
        .select()
        .from(schema.userQuests)
        .where(
          and(
            eq(schema.userQuests.userId, userId),
            eq(schema.userQuests.questDate, dateStr),
            eq(schema.userQuests.questCode, questCode)
          )
        )
        .limit(1);

      if (!quest) throw new StoreError(404, 'QUEST_NOT_FOUND', 'Quest not found');
      if (quest.claimed) throw new StoreError(409, 'QUEST_ALREADY_CLAIMED', 'Quest reward already claimed');
      if (quest.progress < quest.target) {
        throw new StoreError(400, 'QUEST_INCOMPLETE', 'Quest target has not been reached yet');
      }

      const [updatedQuest] = await tx
        .update(schema.userQuests)
        .set({ claimed: true, claimedAt: new Date() })
        .where(eq(schema.userQuests.id, quest.id))
        .returning();

      const [updatedUser] = await tx
        .update(schema.users)
        .set({
          hexaCoins: sql`${schema.users.hexaCoins} + ${quest.rewardCoins}`,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId))
        .returning();

      if (!updatedQuest || !updatedUser) {
        throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
      }

      return {
        quest: {
          questCode: updatedQuest.questCode,
          title: updatedQuest.title,
          target: updatedQuest.target,
          progress: updatedQuest.progress,
          rewardCoins: updatedQuest.rewardCoins,
          claimed: updatedQuest.claimed,
          questDate: updatedQuest.questDate
        },
        rewardCoins: quest.rewardCoins,
        hexaCoins: updatedUser.hexaCoins
      };
    });
  }

  async claimDailyStreak(userId: string, dateStr = getUtcDateString()): Promise<StreakClaimResult> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

      if (user.lastStreakClaimDate === dateStr) {
        return {
          claimed: false,
          alreadyClaimed: true,
          streakCount: user.streakCount,
          rewardCoins: 0,
          hexaCoins: user.hexaCoins,
          claimDate: dateStr
        };
      }

      const yesterday = getPreviousUtcDateString(dateStr);
      const nextStreak = user.lastStreakClaimDate === yesterday ? (user.streakCount % 7) + 1 : 1;
      const rewardCoins = STREAK_REWARDS[nextStreak - 1] ?? 25;

      const [updated] = await tx
        .update(schema.users)
        .set({
          streakCount: nextStreak,
          lastStreakClaimDate: dateStr,
          lastLoginDate: dateStr,
          hexaCoins: sql`${schema.users.hexaCoins} + ${rewardCoins}`,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, userId))
        .returning();

      return {
        claimed: true,
        alreadyClaimed: false,
        streakCount: nextStreak,
        rewardCoins,
        hexaCoins: updated?.hexaCoins ?? user.hexaCoins + rewardCoins,
        claimDate: dateStr
      };
    });
  }

  async linkSocialAccount(
    userId: string,
    identity: VerifiedSocialIdentity
  ): Promise<{ player: PlayerProfile; mergedFromUserId?: string }> {
    const today = getUtcDateString();
    const normalizedEmail = identity.email?.trim().toLowerCase() || undefined;

    const result = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!current) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

      const providerCondition =
        identity.provider === 'apple'
          ? eq(schema.users.appleSub, identity.providerSub)
          : identity.provider === 'google'
            ? eq(schema.users.googleSub, identity.providerSub)
            : eq(schema.users.facebookId, identity.providerSub);

      let [existingOwner] = await tx
        .select()
        .from(schema.users)
        .where(providerCondition)
        .limit(1);

      if (!existingOwner && normalizedEmail) {
        const [emailOwner] = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, normalizedEmail))
          .limit(1);
        const slotFree =
          emailOwner &&
          ((identity.provider === 'apple' && !emailOwner.appleSub) ||
            (identity.provider === 'google' && !emailOwner.googleSub) ||
            (identity.provider === 'facebook' && !emailOwner.facebookId));
        if (emailOwner && emailOwner.id !== current.id && slotFree) {
          existingOwner = emailOwner;
        }
      }

      if (existingOwner && existingOwner.id !== current.id) {
        // Merge guest account into existing social account
        const guestInv = await tx
          .select({ itemCode: schema.userInventory.itemCode })
          .from(schema.userInventory)
          .where(eq(schema.userInventory.userId, current.id));

        for (const inv of guestInv) {
          await tx
            .insert(schema.userInventory)
            .values({ userId: existingOwner.id, itemCode: inv.itemCode })
            .onConflictDoNothing();
        }

        await tx
          .update(schema.scores)
          .set({ userId: existingOwner.id })
          .where(eq(schema.scores.userId, current.id));
        await tx
          .update(schema.gameSessions)
          .set({ userId: existingOwner.id })
          .where(eq(schema.gameSessions.userId, current.id));

        // Delete current guest first so guest_device_id UNIQUE constraint cannot collide on reassign
        await tx.delete(schema.users).where(eq(schema.users.id, current.id));

        const ownerUpdates: Partial<typeof schema.users.$inferInsert> = {
          hexaCoins: sql`${schema.users.hexaCoins} + ${current.hexaCoins}` as unknown as number,
          highScoreClassic: sql`GREATEST(${schema.users.highScoreClassic}, ${current.highScoreClassic})` as unknown as number,
          highScoreDaily: sql`GREATEST(${schema.users.highScoreDaily}, ${current.highScoreDaily})` as unknown as number,
          guestDeviceId: current.guestDeviceId ?? existingOwner.guestDeviceId,
          updatedAt: new Date()
        };
        if (identity.provider === 'apple' && !existingOwner.appleSub) {
          ownerUpdates.appleSub = identity.providerSub;
        }
        if (identity.provider === 'google' && !existingOwner.googleSub) {
          ownerUpdates.googleSub = identity.providerSub;
        }
        if (identity.provider === 'facebook' && !existingOwner.facebookId) {
          ownerUpdates.facebookId = identity.providerSub;
        }

        const [merged] = await tx
          .update(schema.users)
          .set(ownerUpdates)
          .where(eq(schema.users.id, existingOwner.id))
          .returning();

        return { row: merged ?? existingOwner, mergedFromUserId: current.id };
      }

      const updateFields: Partial<typeof schema.users.$inferInsert> = {
        updatedAt: new Date()
      };
      if (identity.provider === 'apple') updateFields.appleSub = identity.providerSub;
      if (identity.provider === 'google') updateFields.googleSub = identity.providerSub;
      if (identity.provider === 'facebook') updateFields.facebookId = identity.providerSub;
      if (
        identity.avatarUrl &&
        isValidAvatarUrl(identity.avatarUrl) &&
        (!current.avatarUrl || current.avatarUrl === DEFAULT_AVATAR_URL)
      ) {
        updateFields.avatarUrl = identity.avatarUrl;
      }
      if (identity.displayName && /^GyroPilot\d*$/i.test(current.displayName)) {
        updateFields.displayName = identity.displayName.slice(0, 32);
      }
      if (!current.email && normalizedEmail) {
        const [emailOwner] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, normalizedEmail))
          .limit(1);
        if (!emailOwner) {
          updateFields.email = normalizedEmail;
        }
      }

      const [updated] = await tx
        .update(schema.users)
        .set(updateFields)
        .where(eq(schema.users.id, current.id))
        .returning();

      return { row: updated ?? current };
    });

    return {
      player: await this.hydrateProfile(result.row, today),
      mergedFromUserId: result.mergedFromUserId
    };
  }

  async deleteUserAccount(userId: string): Promise<{ deleted: boolean; userId: string }> {
    const deleted = await this.db
      .delete(schema.users)
      .where(eq(schema.users.id, userId))
      .returning({ id: schema.users.id });
    return { deleted: deleted.length > 0, userId };
  }

  async deleteByFacebookId(facebookId: string): Promise<{ deleted: boolean; deletedUserId?: string }> {
    const deleted = await this.db
      .delete(schema.users)
      .where(eq(schema.users.facebookId, facebookId))
      .returning({ id: schema.users.id });
    return { deleted: deleted.length > 0, deletedUserId: deleted[0]?.id };
  }

  async registerEmailAccount(
    userId: string,
    email: string,
    passwordHash: string,
    displayName?: string
  ): Promise<PlayerProfile> {
    const today = getUtcDateString();
    const normalizedEmail = email.trim().toLowerCase();

    const updated = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!current) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');

      const [existingEmailOwner] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, normalizedEmail))
        .limit(1);
      if (existingEmailOwner) {
        throw new StoreError(409, 'EMAIL_ALREADY_EXISTS', 'Bu e-posta adresi zaten kayıtlı.');
      }

      if (current.email !== null) {
        throw new StoreError(409, 'ALREADY_REGISTERED', 'Bu hesap zaten bir e-posta adresine bağlı.');
      }

      const updateFields: Partial<typeof schema.users.$inferInsert> = {
        email: normalizedEmail,
        passwordHash,
        updatedAt: new Date()
      };
      if (displayName && displayName.trim().length > 0) {
        updateFields.displayName = displayName.trim().slice(0, 32);
      }

      const [saved] = await tx
        .update(schema.users)
        .set(updateFields)
        .where(eq(schema.users.id, current.id))
        .returning();

      return saved ?? current;
    });

    return this.hydrateProfile(updated, today);
  }

  async loginEmailAccount(
    currentUserId: string | undefined,
    email: string,
    password: string,
    verifyFn: (pw: string, hash: string) => boolean
  ): Promise<{ player: PlayerProfile; mergedFromUserId?: string }> {
    const today = getUtcDateString();
    const normalizedEmail = email.trim().toLowerCase();

    const result = await this.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, normalizedEmail))
        .limit(1);

      if (!target || !target.passwordHash || !verifyFn(password, target.passwordHash)) {
        throw new StoreError(401, 'INVALID_CREDENTIALS', 'E-posta adresi veya şifre hatalı.');
      }

      if (currentUserId && currentUserId !== target.id) {
        const [current] = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, currentUserId))
          .limit(1);

        if (current && !current.email) {
          const guestInv = await tx
            .select({ itemCode: schema.userInventory.itemCode })
            .from(schema.userInventory)
            .where(eq(schema.userInventory.userId, current.id));

          for (const inv of guestInv) {
            await tx
              .insert(schema.userInventory)
              .values({ userId: target.id, itemCode: inv.itemCode })
              .onConflictDoNothing();
          }

          await tx
            .update(schema.scores)
            .set({ userId: target.id })
            .where(eq(schema.scores.userId, current.id));
          await tx
            .update(schema.gameSessions)
            .set({ userId: target.id })
            .where(eq(schema.gameSessions.userId, current.id));

          const extraCoins = Math.max(0, current.hexaCoins - 100);
          const nextDeviceId = current.guestDeviceId ?? target.guestDeviceId;
          const guestClassic = current.highScoreClassic;
          const guestDaily = current.highScoreDaily;

          await tx.delete(schema.users).where(eq(schema.users.id, current.id));

          const [merged] = await tx
            .update(schema.users)
            .set({
              hexaCoins: sql`${schema.users.hexaCoins} + ${extraCoins}`,
              highScoreClassic: sql`GREATEST(${schema.users.highScoreClassic}, ${guestClassic})`,
              highScoreDaily: sql`GREATEST(${schema.users.highScoreDaily}, ${guestDaily})`,
              guestDeviceId: nextDeviceId,
              updatedAt: new Date()
            })
            .where(eq(schema.users.id, target.id))
            .returning();

          return { row: merged ?? target, mergedFromUserId: current.id };
        }
      }

      return { row: target };
    });

    return {
      player: await this.hydrateProfile(result.row, today),
      mergedFromUserId: result.mergedFromUserId
    };
  }

  async createPasswordResetToken(
    email: string,
    codeHash: string,
    opts: { ttlMinutes?: number; cooldownSeconds?: number } = {}
  ): Promise<{
    created: boolean;
    userId?: string;
    displayName?: string;
    cooldownActive?: boolean;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();
    const nowMs = now.getTime();
    const ttlMinutes = opts.ttlMinutes ?? 15;
    const cooldownMs = (opts.cooldownSeconds ?? 60) * 1000;

    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: schema.users.id, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.email, normalizedEmail))
        .limit(1);

      if (!target) {
        return { created: false };
      }

      if (cooldownMs > 0) {
        const [latest] = await tx
          .select({
            id: schema.passwordResetTokens.id,
            expiresAt: schema.passwordResetTokens.expiresAt,
            createdAt: schema.passwordResetTokens.createdAt
          })
          .from(schema.passwordResetTokens)
          .where(
            and(
              eq(schema.passwordResetTokens.email, normalizedEmail),
              isNull(schema.passwordResetTokens.usedAt)
            )
          )
          .orderBy(desc(schema.passwordResetTokens.createdAt))
          .limit(1);

        if (
          latest &&
          latest.expiresAt.getTime() > nowMs &&
          nowMs - latest.createdAt.getTime() < cooldownMs
        ) {
          return { created: false, cooldownActive: true };
        }
      }

      await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(schema.passwordResetTokens.email, normalizedEmail),
            isNull(schema.passwordResetTokens.usedAt)
          )
        );

      await tx.insert(schema.passwordResetTokens).values({
        userId: target.id,
        email: normalizedEmail,
        codeHash,
        attempts: 0,
        expiresAt: new Date(nowMs + ttlMinutes * 60_000)
      });

      return {
        created: true,
        userId: target.id,
        displayName: target.displayName
      };
    });
  }

  async consumePasswordResetToken(
    email: string,
    verifyCodeFn: (codeHash: string) => boolean,
    newPasswordHash: string
  ): Promise<PlayerProfile> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();
    const nowMs = now.getTime();
    const today = getUtcDateString();

    const [latest] = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.email, normalizedEmail),
          isNull(schema.passwordResetTokens.usedAt)
        )
      )
      .orderBy(desc(schema.passwordResetTokens.createdAt))
      .limit(1);

    if (!latest || latest.expiresAt.getTime() <= nowMs || latest.attempts >= 5) {
      throw new StoreError(400, 'RESET_CODE_INVALID', 'Doğrulama kodu geçersiz veya süresi dolmuş.');
    }

    if (!verifyCodeFn(latest.codeHash)) {
      const nextAttempts = latest.attempts + 1;
      await this.db
        .update(schema.passwordResetTokens)
        .set({
          attempts: nextAttempts,
          ...(nextAttempts >= 5 ? { usedAt: now } : {})
        })
        .where(eq(schema.passwordResetTokens.id, latest.id));
      throw new StoreError(400, 'RESET_CODE_INVALID', 'Doğrulama kodu geçersiz veya süresi dolmuş.');
    }

    const updatedUser = await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(schema.passwordResetTokens.id, latest.id),
            isNull(schema.passwordResetTokens.usedAt)
          )
        )
        .returning({ id: schema.passwordResetTokens.id });

      if (claimed.length === 0) {
        throw new StoreError(400, 'RESET_CODE_INVALID', 'Doğrulama kodu geçersiz veya süresi dolmuş.');
      }

      await tx
        .update(schema.passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(schema.passwordResetTokens.email, normalizedEmail),
            isNull(schema.passwordResetTokens.usedAt)
          )
        );

      const [updated] = await tx
        .update(schema.users)
        .set({
          passwordHash: newPasswordHash,
          updatedAt: now
        })
        .where(eq(schema.users.id, latest.userId))
        .returning();

      if (!updated) {
        throw new StoreError(400, 'RESET_CODE_INVALID', 'Doğrulama kodu geçersiz veya süresi dolmuş.');
      }
      return updated;
    });

    return this.hydrateProfile(updatedUser, today);
  }

  async grantAdReward(params: {
    transactionId: string;
    userId: string;
    rewardItem: string;
    rewardAmount: number;
    keyId: string;
  }): Promise<{ granted: boolean; duplicate: boolean; hexaCoins: number }> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, params.userId))
        .limit(1);
      if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

      const inserted = await tx
        .insert(schema.adRewards)
        .values({
          transactionId: params.transactionId,
          userId: params.userId,
          rewardItem: params.rewardItem,
          rewardAmount: params.rewardAmount,
          keyId: params.keyId
        })
        .onConflictDoNothing({ target: schema.adRewards.transactionId })
        .returning();

      if (inserted.length === 0) {
        return { granted: false, duplicate: true, hexaCoins: user.hexaCoins };
      }

      const [updated] = await tx
        .update(schema.users)
        .set({
          hexaCoins: sql`${schema.users.hexaCoins} + ${params.rewardAmount}`,
          updatedAt: new Date()
        })
        .where(eq(schema.users.id, params.userId))
        .returning();

      return {
        granted: true,
        duplicate: false,
        hexaCoins: updated?.hexaCoins ?? user.hexaCoins + params.rewardAmount
      };
    });
  }

  async getPlayerStats(userId: string): Promise<PlayerStats> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');

    const [aggRows, sideRows, questRows, recentRows, unlockedCodes] = await Promise.all([
      this.db
        .select({
          totalGames: sql<number>`COUNT(*)::int`,
          classicGames: sql<number>`COALESCE(SUM(CASE WHEN ${schema.scores.mode} = 'classic' THEN 1 ELSE 0 END), 0)::int`,
          dailyGames: sql<number>`COALESCE(SUM(CASE WHEN ${schema.scores.mode} = 'daily' THEN 1 ELSE 0 END), 0)::int`,
          totalBlocksCleared: sql<string>`COALESCE(SUM(${schema.scores.blocksCleared}), 0)::bigint`,
          totalScore: sql<string>`COALESCE(SUM(${schema.scores.score}), 0)::bigint`,
          bestScoreClassic: sql<number>`COALESCE(MAX(CASE WHEN ${schema.scores.mode} = 'classic' THEN ${schema.scores.score} ELSE 0 END), 0)::int`,
          bestScoreDaily: sql<number>`COALESCE(MAX(CASE WHEN ${schema.scores.mode} = 'daily' THEN ${schema.scores.score} ELSE 0 END), 0)::int`,
          bestCombo: sql<number>`COALESCE(MAX(${schema.scores.maxCombo}), 0)::int`,
          totalCoinsEarned: sql<string>`COALESCE(SUM(${schema.scores.coinsEarned}), 0)::bigint`
        })
        .from(schema.scores)
        .where(eq(schema.scores.userId, userId)),
      this.db
        .select({
          sides: schema.scores.sides,
          games: sql<number>`COUNT(*)::int`,
          bestScore: sql<number>`COALESCE(MAX(${schema.scores.score}), 0)::int`,
          blocksCleared: sql<string>`COALESCE(SUM(${schema.scores.blocksCleared}), 0)::bigint`
        })
        .from(schema.scores)
        .where(eq(schema.scores.userId, userId))
        .groupBy(schema.scores.sides),
      this.db
        .select({
          questsCompleted: sql<number>`COUNT(*)::int`
        })
        .from(schema.userQuests)
        .where(and(eq(schema.userQuests.userId, userId), eq(schema.userQuests.claimed, true))),
      this.db
        .select()
        .from(schema.scores)
        .where(eq(schema.scores.userId, userId))
        .orderBy(desc(schema.scores.createdAt))
        .limit(5),
      this.getUnlockedCodes(userId)
    ]);

    const agg = aggRows[0];
    const sideMap = new Map<
      PolygonSides,
      { games: number; bestScore: number; blocksCleared: number }
    >();
    for (const r of sideRows) {
      const s = isSupportedSides(r.sides) ? r.sides : DEFAULT_SIDES;
      const cur = sideMap.get(s) ?? { games: 0, bestScore: 0, blocksCleared: 0 };
      cur.games += Number(r.games ?? 0);
      cur.bestScore = Math.max(cur.bestScore, Number(r.bestScore ?? 0));
      cur.blocksCleared += Number(r.blocksCleared ?? 0);
      sideMap.set(s, cur);
    }

    const recentGames: RecentGameItem[] = recentRows.map((row) => ({
      id: row.id,
      mode: (row.mode === 'daily' ? 'daily' : 'classic') as GameMode,
      sides: isSupportedSides(row.sides) ? row.sides : DEFAULT_SIDES,
      score: row.score,
      maxCombo: row.maxCombo,
      blocksCleared: row.blocksCleared,
      coinsEarned: row.coinsEarned,
      createdAt: row.createdAt.toISOString()
    }));

    return finalizePlayerStats({
      totalGames: Number(agg?.totalGames ?? 0),
      classicGames: Number(agg?.classicGames ?? 0),
      dailyGames: Number(agg?.dailyGames ?? 0),
      totalBlocksCleared: Number(agg?.totalBlocksCleared ?? 0),
      totalScore: Number(agg?.totalScore ?? 0),
      bestScoreClassic: Math.max(user.highScoreClassic, Number(agg?.bestScoreClassic ?? 0)),
      bestScoreDaily: Math.max(user.highScoreDaily, Number(agg?.bestScoreDaily ?? 0)),
      bestCombo: Number(agg?.bestCombo ?? 0),
      totalCoinsEarned: Number(agg?.totalCoinsEarned ?? 0),
      questsCompleted: Number(questRows[0]?.questsCompleted ?? 0),
      unlockedThemesCount: unlockedCodes.length,
      memberSince: user.createdAt.toISOString(),
      sideMap,
      recentGames
    });
  }

  async getAdminOverview(): Promise<AdminOverview> {
    const dates = buildLast14UtcDates();
    const today = dates[dates.length - 1] ?? getUtcDateString();
    const startDate = dates[0] ?? today;

    const [
      usersRes,
      scoresRes,
      topPlayerRes,
      sessionsRes,
      userTrendRes,
      scoreTrendRes,
      sideAggRes,
      questRes,
      equippedRes,
      unlockedRes
    ] = await Promise.all([
      this.pool.query<{
        totalUsers: number;
        registeredUsers: number;
        guestUsers: number;
        bannedUsers: number;
        newUsers24h: number;
        newUsers7d: number;
        totalCoinsInCirculation: string;
      }>(
        `SELECT
          COUNT(*)::int AS "totalUsers",
          COUNT(*) FILTER (WHERE email IS NOT NULL)::int AS "registeredUsers",
          COUNT(*) FILTER (WHERE email IS NULL)::int AS "guestUsers",
          COUNT(*) FILTER (WHERE is_banned = true AND (banned_until IS NULL OR banned_until > NOW()))::int AS "bannedUsers",
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS "newUsers24h",
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS "newUsers7d",
          COALESCE(SUM(hexa_coins), 0)::bigint AS "totalCoinsInCirculation"
        FROM users`
      ),
      this.pool.query<{
        totalGames: number;
        classicGames: number;
        dailyGames: number;
        gamesToday: number;
        games7d: number;
        activePlayersToday: number;
        activePlayers7d: number;
        totalBlocksCleared: string;
        totalScore: string;
        highestScore: number;
        bestCombo: number;
        totalCoinsEarnedFromGames: string;
      }>(
        `SELECT
          COUNT(*)::int AS "totalGames",
          COUNT(*) FILTER (WHERE mode = 'classic')::int AS "classicGames",
          COUNT(*) FILTER (WHERE mode = 'daily')::int AS "dailyGames",
          COUNT(*) FILTER (WHERE TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = $1)::int AS "gamesToday",
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS "games7d",
          COUNT(DISTINCT user_id) FILTER (WHERE TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = $1)::int AS "activePlayersToday",
          COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS "activePlayers7d",
          COALESCE(SUM(blocks_cleared), 0)::bigint AS "totalBlocksCleared",
          COALESCE(SUM(score), 0)::bigint AS "totalScore",
          COALESCE(MAX(score), 0)::int AS "highestScore",
          COALESCE(MAX(max_combo), 0)::int AS "bestCombo",
          COALESCE(SUM(coins_earned), 0)::bigint AS "totalCoinsEarnedFromGames"
        FROM scores`,
        [today]
      ),
      this.pool.query<{ playerName: string }>(
        `SELECT player_name AS "playerName" FROM scores ORDER BY score DESC, created_at DESC LIMIT 1`
      ),
      this.pool.query<{ totalSessions: number; verifiedSessions: number }>(
        `SELECT
          COUNT(*)::int AS "totalSessions",
          COUNT(*) FILTER (WHERE verified = true)::int AS "verifiedSessions"
        FROM game_sessions`
      ),
      this.pool.query<{ day: string; newUsers: number }>(
        `SELECT
          TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS "newUsers"
        FROM users
        WHERE TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') >= $1
        GROUP BY day`,
        [startDate]
      ),
      this.pool.query<{ day: string; games: number; activePlayers: number }>(
        `SELECT
          TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS games,
          COUNT(DISTINCT user_id)::int AS "activePlayers"
        FROM scores
        WHERE TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') >= $1
        GROUP BY day`,
        [startDate]
      ),
      this.pool.query<{
        sides: number;
        games: number;
        avgScore: number;
        bestScore: number;
        totalBlocksCleared: string;
      }>(
        `SELECT
          sides,
          COUNT(*)::int AS games,
          COALESCE(AVG(score), 0)::float8 AS "avgScore",
          COALESCE(MAX(score), 0)::int AS "bestScore",
          COALESCE(SUM(blocks_cleared), 0)::bigint AS "totalBlocksCleared"
        FROM scores
        GROUP BY sides`
      ),
      this.pool.query<{ questsCompletedTotal: number }>(
        `SELECT COUNT(*)::int AS "questsCompletedTotal" FROM user_quests WHERE claimed = true`
      ),
      this.pool.query<{ code: string; cnt: number }>(
        `SELECT equipped_theme AS code, COUNT(*)::int AS cnt FROM users GROUP BY equipped_theme`
      ),
      this.pool.query<{ code: string; cnt: number }>(
        `SELECT item_code AS code, COUNT(*)::int AS cnt FROM user_inventory GROUP BY item_code`
      )
    ]);

    const uRow = usersRes.rows[0];
    const sRow = scoresRes.rows[0];
    const sessRow = sessionsRes.rows[0];
    const totalUsers = Number(uRow?.totalUsers ?? 0);
    const totalGames = Number(sRow?.totalGames ?? 0);
    const totalScore = Number(sRow?.totalScore ?? 0);

    const userDayMap = new Map<string, number>();
    for (const r of userTrendRes.rows) {
      userDayMap.set(r.day, Number(r.newUsers ?? 0));
    }
    const scoreDayMap = new Map<string, { games: number; activePlayers: number }>();
    for (const r of scoreTrendRes.rows) {
      scoreDayMap.set(r.day, {
        games: Number(r.games ?? 0),
        activePlayers: Number(r.activePlayers ?? 0)
      });
    }

    const dailyTrend: AdminDailyPoint[] = dates.map((date) => {
      const sc = scoreDayMap.get(date);
      return {
        date,
        newUsers: userDayMap.get(date) ?? 0,
        games: sc?.games ?? 0,
        activePlayers: sc?.activePlayers ?? 0
      };
    });

    const sideMap = new Map<PolygonSides, AdminSideOverview>();
    for (const r of sideAggRes.rows) {
      const s = isSupportedSides(r.sides) ? r.sides : DEFAULT_SIDES;
      const existing = sideMap.get(s);
      const games = Number(r.games ?? 0);
      if (existing) {
        const prevScoreTotal = existing.averageScore * existing.games;
        const nextGames = existing.games + games;
        existing.games = nextGames;
        existing.averageScore =
          nextGames > 0 ? Math.round((prevScoreTotal + Number(r.avgScore ?? 0) * games) / nextGames) : 0;
        existing.bestScore = Math.max(existing.bestScore, Number(r.bestScore ?? 0));
        existing.totalBlocksCleared += Number(r.totalBlocksCleared ?? 0);
      } else {
        sideMap.set(s, {
          sides: s,
          games,
          averageScore: Math.round(Number(r.avgScore ?? 0)),
          bestScore: Number(r.bestScore ?? 0),
          totalBlocksCleared: Number(r.totalBlocksCleared ?? 0)
        });
      }
    }
    const bySides: AdminSideOverview[] = SUPPORTED_SIDES.map(
      (s) =>
        sideMap.get(s) ?? {
          sides: s,
          games: 0,
          averageScore: 0,
          bestScore: 0,
          totalBlocksCleared: 0
        }
    );

    const equippedMap = new Map<string, number>();
    for (const r of equippedRes.rows) {
      equippedMap.set(r.code, Number(r.cnt ?? 0));
    }
    const unlockedMap = new Map<string, number>();
    for (const r of unlockedRes.rows) {
      unlockedMap.set(r.code, Number(r.cnt ?? 0));
    }

    let paidThemesUnlockedTotal = 0;
    const themes: AdminThemeStat[] = DEFAULT_SHOP_ITEMS.map((item) => {
      const invCount = unlockedMap.get(item.code) ?? 0;
      if (item.price > 0) paidThemesUnlockedTotal += invCount;
      return {
        code: item.code,
        name: item.name,
        price: item.price,
        unlockedCount: item.price === 0 ? Math.max(invCount, totalUsers) : invCount,
        equippedCount: equippedMap.get(item.code) ?? 0
      };
    });

    return {
      totalUsers,
      registeredUsers: Number(uRow?.registeredUsers ?? 0),
      guestUsers: Number(uRow?.guestUsers ?? 0),
      bannedUsers: Number(uRow?.bannedUsers ?? 0),
      newUsers24h: Number(uRow?.newUsers24h ?? 0),
      newUsers7d: Number(uRow?.newUsers7d ?? 0),
      activePlayersToday: Number(sRow?.activePlayersToday ?? 0),
      activePlayers7d: Number(sRow?.activePlayers7d ?? 0),
      totalGames,
      classicGames: Number(sRow?.classicGames ?? 0),
      dailyGames: Number(sRow?.dailyGames ?? 0),
      gamesToday: Number(sRow?.gamesToday ?? 0),
      games7d: Number(sRow?.games7d ?? 0),
      totalSessions: Number(sessRow?.totalSessions ?? 0),
      verifiedSessions: Number(sessRow?.verifiedSessions ?? 0),
      totalBlocksCleared: Number(sRow?.totalBlocksCleared ?? 0),
      totalScore,
      averageScore: totalGames > 0 ? Math.round(totalScore / totalGames) : 0,
      highestScore: Number(sRow?.highestScore ?? 0),
      highestScorePlayer: topPlayerRes.rows[0]?.playerName ?? null,
      bestCombo: Number(sRow?.bestCombo ?? 0),
      totalCoinsInCirculation: Number(uRow?.totalCoinsInCirculation ?? 0),
      totalCoinsEarnedFromGames: Number(sRow?.totalCoinsEarnedFromGames ?? 0),
      questsCompletedTotal: Number(questRes.rows[0]?.questsCompletedTotal ?? 0),
      paidThemesUnlockedTotal,
      dailyTrend,
      bySides,
      themes
    };
  }

  async listAdminPlayers(query: AdminPlayerListQuery): Promise<AdminPlayerListResult> {
    const accountType = query.accountType ?? 'all';
    const sort = query.sort ?? 'newest';
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 20));

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query.q && query.q.trim().length > 0) {
      params.push(`%${query.q.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(u.display_name ILIKE $${idx} OR COALESCE(u.email, '') ILIKE $${idx} OR COALESCE(u.guest_device_id, '') ILIKE $${idx})`
      );
    }
    if (accountType === 'registered') {
      conditions.push('u.email IS NOT NULL');
    } else if (accountType === 'guest') {
      conditions.push('u.email IS NULL');
    } else if (accountType === 'banned') {
      conditions.push('(u.is_banned = true AND (u.banned_until IS NULL OR u.banned_until > NOW()))');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy: string;
    switch (sort) {
      case 'best_score':
        orderBy = '"bestScore" DESC, u.created_at DESC';
        break;
      case 'most_games':
        orderBy = '"totalGames" DESC, u.created_at DESC';
        break;
      case 'most_coins':
        orderBy = 'u.hexa_coins DESC, u.created_at DESC';
        break;
      case 'last_active':
        orderBy = 'COALESCE(sc.last_played_at, u.created_at) DESC';
        break;
      case 'newest':
      default:
        orderBy = 'u.created_at DESC';
        break;
    }

    const countRes = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`,
      params
    );
    const total = Number(countRes.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.max(1, Math.min(totalPages, query.page ?? 1));
    const offset = (page - 1) * pageSize;

    const listParams = [...params, pageSize, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const dataRes = await this.pool.query<{
      id: string;
      displayName: string;
      email: string | null;
      guestDeviceId: string;
      accountType: 'registered' | 'guest';
      hexaCoins: number;
      streakCount: number;
      highScoreClassic: number;
      highScoreDaily: number;
      bestScore: number;
      equippedTheme: string;
      unlockedThemesCount: number;
      totalGames: number;
      totalBlocksCleared: string;
      bestCombo: number;
      rawBanned: boolean;
      rawBannedUntil: Date | null;
      rawBanReason: string | null;
      lastLoginDate: string | null;
      lastPlayedAt: Date | null;
      createdAt: Date;
    }>(
      `SELECT
        u.id,
        u.display_name AS "displayName",
        u.email,
        COALESCE(u.guest_device_id, u.id::text) AS "guestDeviceId",
        CASE WHEN u.email IS NOT NULL THEN 'registered' ELSE 'guest' END AS "accountType",
        u.hexa_coins AS "hexaCoins",
        u.streak_count AS "streakCount",
        u.high_score_classic AS "highScoreClassic",
        u.high_score_daily AS "highScoreDaily",
        GREATEST(u.high_score_classic, u.high_score_daily, COALESCE(sc.max_score, 0))::int AS "bestScore",
        u.equipped_theme AS "equippedTheme",
        (2 + COALESCE(inv.paid_count, 0))::int AS "unlockedThemesCount",
        COALESCE(sc.total_games, 0)::int AS "totalGames",
        COALESCE(sc.total_blocks_cleared, 0)::bigint AS "totalBlocksCleared",
        COALESCE(sc.best_combo, 0)::int AS "bestCombo",
        u.is_banned AS "rawBanned",
        u.banned_until AS "rawBannedUntil",
        u.ban_reason AS "rawBanReason",
        u.last_login_date AS "lastLoginDate",
        sc.last_played_at AS "lastPlayedAt",
        u.created_at AS "createdAt"
      FROM users u
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*)::int AS total_games,
          COALESCE(SUM(blocks_cleared), 0)::bigint AS total_blocks_cleared,
          COALESCE(MAX(max_combo), 0)::int AS best_combo,
          COALESCE(MAX(score), 0)::int AS max_score,
          MAX(created_at) AS last_played_at
        FROM scores
        GROUP BY user_id
      ) sc ON sc.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) FILTER (WHERE item_code NOT IN ('cyberpunk', 'classic'))::int AS paid_count
        FROM user_inventory
        GROUP BY user_id
      ) inv ON inv.user_id = u.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams
    );

    return {
      items: dataRes.rows.map((r) => {
        const ban = computeBanInfo(Boolean(r.rawBanned), r.rawBannedUntil, r.rawBanReason);
        return {
          id: r.id,
          displayName: r.displayName,
          email: r.email,
          guestDeviceId: r.guestDeviceId,
          accountType: r.accountType,
          hexaCoins: Number(r.hexaCoins),
          streakCount: Number(r.streakCount),
          highScoreClassic: Number(r.highScoreClassic),
          highScoreDaily: Number(r.highScoreDaily),
          bestScore: Number(r.bestScore),
          equippedTheme: r.equippedTheme,
          unlockedThemesCount: Number(r.unlockedThemesCount),
          totalGames: Number(r.totalGames),
          totalBlocksCleared: Number(r.totalBlocksCleared),
          bestCombo: Number(r.bestCombo),
          isBanned: ban.isBanned,
          isPermanentBan: ban.isPermanent,
          bannedUntil: ban.bannedUntil,
          banReason: ban.banReason,
          lastLoginDate: r.lastLoginDate,
          lastPlayedAt: r.lastPlayedAt ? new Date(r.lastPlayedAt).toISOString() : null,
          createdAt: new Date(r.createdAt).toISOString()
        };
      }),
      total,
      page,
      pageSize,
      totalPages
    };
  }

  async getAdminPlayerDetail(userId: string): Promise<AdminPlayerDetail | undefined> {
    const today = getUtcDateString();
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!row) return undefined;

    const [player, stats, quests, recentRows, visitRows] = await Promise.all([
      this.hydrateProfile(row, today),
      this.getPlayerStats(userId),
      this.ensureQuestsRows(userId, today),
      this.db
        .select()
        .from(schema.scores)
        .where(eq(schema.scores.userId, userId))
        .orderBy(desc(schema.scores.createdAt))
        .limit(15),
      this.db
        .select()
        .from(schema.siteVisits)
        .where(eq(schema.siteVisits.userId, userId))
        .orderBy(desc(schema.siteVisits.startedAt))
        .limit(100)
    ]);

    return {
      player,
      stats,
      quests,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastLoginDate: row.lastLoginDate,
      recentGames: recentRows.map((sc) => ({
        id: sc.id,
        mode: (sc.mode === 'daily' ? 'daily' : 'classic') as GameMode,
        sides: isSupportedSides(sc.sides) ? sc.sides : DEFAULT_SIDES,
        score: sc.score,
        maxCombo: sc.maxCombo,
        blocksCleared: sc.blocksCleared,
        coinsEarned: sc.coinsEarned,
        createdAt: sc.createdAt.toISOString()
      })),
      visitSummary: buildPlayerVisitSummary(visitRows.map((r) => mapPgVisitRow(r, row.displayName, row.email)))
    };
  }

  async updateAdminPlayer(
    userId: string,
    patch: AdminUpdatePlayerInput
  ): Promise<AdminPlayerDetail> {
    if (patch.unlockThemeCode !== undefined) {
      const valid = DEFAULT_SHOP_ITEMS.some((it) => it.code === patch.unlockThemeCode);
      if (!valid) throw new StoreError(400, 'INVALID_THEME', 'Geçersiz tema kodu.');
    }
    if (patch.equippedTheme !== undefined) {
      const valid = DEFAULT_SHOP_ITEMS.some((it) => it.code === patch.equippedTheme);
      if (!valid) throw new StoreError(400, 'INVALID_THEME', 'Geçersiz tema kodu.');
    }

    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (!current) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');

      const updateFields: Partial<typeof schema.users.$inferInsert> = {
        updatedAt: new Date()
      };

      if (patch.displayName !== undefined) {
        const trimmed = patch.displayName.trim().slice(0, 32);
        if (trimmed.length > 0) updateFields.displayName = trimmed;
      }

      if (patch.hexaCoins !== undefined) {
        updateFields.hexaCoins = Math.max(0, Math.floor(patch.hexaCoins));
      } else if (patch.coinsDelta !== undefined) {
        updateFields.hexaCoins = Math.max(0, current.hexaCoins + Math.floor(patch.coinsDelta));
      }

      if (patch.streakCount !== undefined) {
        updateFields.streakCount = Math.max(0, Math.min(365, Math.floor(patch.streakCount)));
      }

      if (patch.equippedTheme !== undefined) {
        updateFields.equippedTheme = patch.equippedTheme;
        await tx
          .insert(schema.userInventory)
          .values({ userId, itemCode: patch.equippedTheme })
          .onConflictDoNothing();
      }

      if (patch.unlockThemeCode !== undefined) {
        await tx
          .insert(schema.userInventory)
          .values({ userId, itemCode: patch.unlockThemeCode })
          .onConflictDoNothing();
      }

      await tx.update(schema.users).set(updateFields).where(eq(schema.users.id, userId));
    });

    const detail = await this.getAdminPlayerDetail(userId);
    if (!detail) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    return detail;
  }

  async listAdminScores(query: AdminScoreListQuery): Promise<AdminScoreListResult> {
    const mode = query.mode ?? 'all';
    const sort = query.sort ?? 'newest';
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25));

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query.q && query.q.trim().length > 0) {
      params.push(`%${query.q.trim()}%`);
      const idx = params.length;
      conditions.push(`(s.player_name ILIKE $${idx} OR COALESCE(u.email, '') ILIKE $${idx})`);
    }
    if (mode === 'classic' || mode === 'daily') {
      params.push(mode);
      conditions.push(`s.mode = $${params.length}`);
    }
    if (query.sides !== undefined) {
      params.push(query.sides);
      conditions.push(`s.sides = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy: string;
    switch (sort) {
      case 'score':
        orderBy = 's.score DESC, s.created_at DESC';
        break;
      case 'blocks':
        orderBy = 's.blocks_cleared DESC, s.created_at DESC';
        break;
      case 'combo':
        orderBy = 's.max_combo DESC, s.created_at DESC';
        break;
      case 'newest':
      default:
        orderBy = 's.created_at DESC';
        break;
    }

    const countRes = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM scores s
       LEFT JOIN users u ON u.id = s.user_id
       ${whereClause}`,
      params
    );
    const total = Number(countRes.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.max(1, Math.min(totalPages, query.page ?? 1));
    const offset = (page - 1) * pageSize;

    const listParams = [...params, pageSize, offset];
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const dataRes = await this.pool.query<{
      id: string;
      sessionId: string;
      userId: string | null;
      playerName: string;
      userEmail: string | null;
      mode: GameMode;
      sides: number;
      score: number;
      maxCombo: number;
      blocksCleared: number;
      coinsEarned: number;
      moveHash: string;
      createdAt: Date;
    }>(
      `SELECT
        s.id,
        s.session_id AS "sessionId",
        s.user_id AS "userId",
        s.player_name AS "playerName",
        u.email AS "userEmail",
        s.mode,
        s.sides,
        s.score,
        s.max_combo AS "maxCombo",
        s.blocks_cleared AS "blocksCleared",
        s.coins_earned AS "coinsEarned",
        s.move_hash AS "moveHash",
        s.created_at AS "createdAt"
      FROM scores s
      LEFT JOIN users u ON u.id = s.user_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams
    );

    return {
      items: dataRes.rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        userId: r.userId,
        playerName: r.playerName,
        userEmail: r.userEmail,
        mode: r.mode === 'daily' ? 'daily' : 'classic',
        sides: isSupportedSides(r.sides) ? r.sides : DEFAULT_SIDES,
        score: Number(r.score),
        maxCombo: Number(r.maxCombo),
        blocksCleared: Number(r.blocksCleared),
        coinsEarned: Number(r.coinsEarned),
        moveHash: r.moveHash,
        createdAt: new Date(r.createdAt).toISOString()
      })),
      total,
      page,
      pageSize,
      totalPages
    };
  }

  async deleteAdminScore(scoreId: string): Promise<{ deleted: boolean; userId?: string }> {
    return this.db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(schema.scores)
        .where(eq(schema.scores.id, scoreId))
        .returning({ userId: schema.scores.userId });

      if (!removed) return { deleted: false };

      if (removed.userId) {
        const [recalc] = await tx
          .select({
            bestClassic: sql<number>`COALESCE(MAX(CASE WHEN ${schema.scores.mode} = 'classic' THEN ${schema.scores.score} ELSE 0 END), 0)::int`,
            bestDaily: sql<number>`COALESCE(MAX(CASE WHEN ${schema.scores.mode} = 'daily' THEN ${schema.scores.score} ELSE 0 END), 0)::int`
          })
          .from(schema.scores)
          .where(eq(schema.scores.userId, removed.userId));

        await tx
          .update(schema.users)
          .set({
            highScoreClassic: Number(recalc?.bestClassic ?? 0),
            highScoreDaily: Number(recalc?.bestDaily ?? 0),
            updatedAt: new Date()
          })
          .where(eq(schema.users.id, removed.userId));
      }

      return { deleted: true, userId: removed.userId ?? undefined };
    });
  }

  async banPlayer(
    userId: string,
    input: { durationHours?: number | null; reason?: string }
  ): Promise<AdminPlayerDetail> {
    const bannedUntil =
      input.durationHours && input.durationHours > 0
        ? new Date(Date.now() + input.durationHours * 3600_000)
        : null;
    const banReason = input.reason?.trim() ? input.reason.trim() : null;

    const [updated] = await this.db
      .update(schema.users)
      .set({
        isBanned: true,
        bannedUntil,
        banReason,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, userId))
      .returning({ id: schema.users.id });

    if (!updated) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    const detail = await this.getAdminPlayerDetail(userId);
    if (!detail) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    return detail;
  }

  async unbanPlayer(userId: string): Promise<AdminPlayerDetail> {
    const [updated] = await this.db
      .update(schema.users)
      .set({
        isBanned: false,
        bannedUntil: null,
        banReason: null,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, userId))
      .returning({ id: schema.users.id });

    if (!updated) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    const detail = await this.getAdminPlayerDetail(userId);
    if (!detail) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
    return detail;
  }

  async grantAdminReward(input: AdminGrantRewardInput): Promise<AdminGrantRewardResult> {
    const coins = Math.max(0, Math.floor(input.coinsAmount ?? 0));
    const themeCode = input.themeCode?.trim() || null;
    if (coins <= 0 && !themeCode) {
      throw new StoreError(400, 'EMPTY_REWARD', 'En az coin veya tema ödülü belirtmelisin.');
    }
    if (themeCode && !DEFAULT_SHOP_ITEMS.some((it) => it.code === themeCode)) {
      throw new StoreError(400, 'INVALID_THEME', 'Geçersiz tema kodu.');
    }

    const reason = input.reason?.trim() ?? '';
    const txRes = await this.db.transaction(async (tx) => {
      let affectedCount = 0;
      let recipientName = '';
      let targetUserId: string | null = null;

      if (input.scope === 'single') {
        if (!input.userId) {
          throw new StoreError(400, 'USER_REQUIRED', 'Tekil ödül için oyuncu seçmelisin.');
        }
        const [updated] = await tx
          .update(schema.users)
          .set({
            hexaCoins: coins > 0 ? sql`${schema.users.hexaCoins} + ${coins}` : schema.users.hexaCoins,
            updatedAt: new Date()
          })
          .where(eq(schema.users.id, input.userId))
          .returning({ id: schema.users.id, displayName: schema.users.displayName });

        if (!updated) throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
        if (themeCode) {
          await tx
            .insert(schema.userInventory)
            .values({ userId: updated.id, itemCode: themeCode })
            .onConflictDoNothing();
        }
        affectedCount = 1;
        recipientName = updated.displayName;
        targetUserId = updated.id;
      } else {
        const whereCond =
          input.scope === 'registered' ? sql`${schema.users.email} IS NOT NULL` : undefined;
        if (themeCode) {
          await tx.execute(
            input.scope === 'registered'
              ? sql`INSERT INTO user_inventory (user_id, item_code) SELECT id, ${themeCode} FROM users WHERE email IS NOT NULL ON CONFLICT (user_id, item_code) DO NOTHING`
              : sql`INSERT INTO user_inventory (user_id, item_code) SELECT id, ${themeCode} FROM users ON CONFLICT (user_id, item_code) DO NOTHING`
          );
        }
        const baseUpdate = tx
          .update(schema.users)
          .set({
            hexaCoins: coins > 0 ? sql`${schema.users.hexaCoins} + ${coins}` : schema.users.hexaCoins,
            updatedAt: new Date()
          });
        const updatedRows = whereCond
          ? await baseUpdate.where(whereCond).returning({ id: schema.users.id })
          : await baseUpdate.returning({ id: schema.users.id });

        affectedCount = updatedRows.length;
        recipientName =
          input.scope === 'registered' ? 'Tüm Kayıtlı Oyuncular' : 'Tüm Oyuncular';
      }

      const [inserted] = await tx
        .insert(schema.adminRewards)
        .values({
          userId: targetUserId,
          recipientName,
          scope: input.scope,
          coinsAmount: coins,
          themeCode,
          reason
        })
        .returning();

      const reward: AdminRewardRecord = {
        id: inserted!.id,
        userId: inserted!.userId,
        recipientName: inserted!.recipientName,
        scope: (inserted!.scope === 'registered' || inserted!.scope === 'all'
          ? inserted!.scope
          : 'single') as AdminRewardRecord['scope'],
        coinsAmount: inserted!.coinsAmount,
        themeCode: inserted!.themeCode,
        reason: inserted!.reason,
        createdAt: inserted!.createdAt.toISOString()
      };

      return { affectedCount, reward, targetUserId };
    });

    const playerDetail =
      input.scope === 'single' && txRes.targetUserId
        ? await this.getAdminPlayerDetail(txRes.targetUserId)
        : undefined;

    return {
      affectedCount: txRes.affectedCount,
      reward: txRes.reward,
      playerDetail
    };
  }

  async listAdminRewards(limit = 50): Promise<AdminRewardRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.adminRewards)
      .orderBy(desc(schema.adminRewards.createdAt))
      .limit(Math.max(1, limit));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      recipientName: r.recipientName,
      scope: (r.scope === 'registered' || r.scope === 'all'
        ? r.scope
        : 'single') as AdminRewardRecord['scope'],
      coinsAmount: r.coinsAmount,
      themeCode: r.themeCode,
      reason: r.reason,
      createdAt: r.createdAt.toISOString()
    }));
  }

  async getAdminPasswordHash(): Promise<string | null> {
    const [row] = await this.db
      .select({ value: schema.adminSettings.value })
      .from(schema.adminSettings)
      .where(eq(schema.adminSettings.key, 'admin_password_hash'))
      .limit(1);
    return row?.value ?? null;
  }

  async setAdminPasswordHash(passwordHash: string): Promise<void> {
    await this.db
      .insert(schema.adminSettings)
      .values({
        key: 'admin_password_hash',
        value: passwordHash,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: schema.adminSettings.key,
        set: {
          value: passwordHash,
          updatedAt: new Date()
        }
      });
  }

  async getTopScoresForWarmup(mode: GameMode, limit = 100) {
    return this.db
      .select()
      .from(schema.scores)
      .where(eq(schema.scores.mode, mode))
      .orderBy(desc(schema.scores.score))
      .limit(limit);
  }

  private async resolveVisitUserId(
    userId: string | null | undefined,
    deviceId: string | null | undefined
  ): Promise<string | null> {
    if (userId) return userId;
    if (!deviceId) return null;
    const [row] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.guestDeviceId, deviceId))
      .limit(1);
    return row?.id ?? null;
  }

  async recordSiteVisit(input: RecordVisitInput): Promise<void> {
    const resolvedUserId = await this.resolveVisitUserId(input.userId, input.deviceId);
    const now = new Date();

    const conflictSet: {
      lastSeenAt: Date;
      userId?: ReturnType<typeof sql<string | null>>;
    } = {
      lastSeenAt: now
    };
    if (resolvedUserId) {
      conflictSet.userId = sql`COALESCE(${schema.siteVisits.userId}, ${resolvedUserId}::uuid)`;
    }

    await this.db
      .insert(schema.siteVisits)
      .values({
        visitToken: input.visitToken,
        userId: resolvedUserId,
        deviceId: input.deviceId ?? null,
        visitorHash: input.visitorHash,
        isReturning: input.isReturning,
        landingPath: input.landingPath || '/',
        referrerUrl: input.referrerUrl,
        referrerHost: input.referrerHost,
        sourceCategory: input.sourceCategory,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        countryCode: input.countryCode,
        region: input.region,
        city: input.city,
        continent: input.continent,
        timezone: input.timezone,
        language: input.language,
        deviceType: input.deviceType,
        osName: input.osName,
        osVersion: input.osVersion,
        browserName: input.browserName,
        browserVersion: input.browserVersion,
        appMode: input.appMode,
        screenWidth: input.screenWidth,
        screenHeight: input.screenHeight,
        viewportWidth: input.viewportWidth,
        viewportHeight: input.viewportHeight,
        connectionType: input.connectionType,
        startedAt: now,
        lastSeenAt: now
      })
      .onConflictDoUpdate({
        target: schema.siteVisits.visitToken,
        set: conflictSet
      });
  }

  async recordSiteHeartbeat(input: RecordHeartbeatInput): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(schema.siteVisits)
      .where(eq(schema.siteVisits.visitToken, input.visitToken))
      .limit(1);
    if (!existing) return;

    const resolvedUserId =
      existing.userId ?? (await this.resolveVisitUserId(input.userId, input.deviceId));
    const durations = clampVisitDurations(
      existing.startedAt.toISOString(),
      existing.siteDurationSec,
      existing.playDurationSec,
      input.siteDurationSec,
      input.playDurationSec
    );

    await this.db
      .update(schema.siteVisits)
      .set({
        userId: resolvedUserId,
        siteDurationSec: durations.siteDurationSec,
        playDurationSec: durations.playDurationSec,
        gamesStarted: Math.max(existing.gamesStarted, Math.floor(input.gamesStarted)),
        gamesCompleted: Math.max(existing.gamesCompleted, Math.floor(input.gamesCompleted)),
        bestScore: Math.max(existing.bestScore, Math.floor(input.bestScore)),
        isPlayingNow: input.isPlayingNow,
        lastMode: input.lastMode ?? existing.lastMode,
        lastSides: input.lastSides ?? existing.lastSides,
        lastLayout: input.lastLayout ?? existing.lastLayout,
        lastSeenAt: new Date()
      })
      .where(eq(schema.siteVisits.id, existing.id));
  }

  async getAdminAnalytics(query: AdminAnalyticsQuery): Promise<AdminAnalyticsReport> {
    const now = new Date();
    const { from } = resolveAnalyticsWindow(query.range, now);

    const rows = await this.db
      .select({
        visit: schema.siteVisits,
        playerName: schema.users.displayName,
        playerEmail: schema.users.email
      })
      .from(schema.siteVisits)
      .leftJoin(schema.users, eq(schema.siteVisits.userId, schema.users.id))
      .where(from ? sql`${schema.siteVisits.startedAt} >= ${from}` : undefined)
      .orderBy(desc(schema.siteVisits.startedAt))
      .limit(20_000);

    const allRangeVisits = rows.map((r) =>
      mapPgVisitRow(r.visit, r.playerName ?? null, r.playerEmail ?? null)
    );
    const filtered = filterAnalyticsVisits(allRangeVisits, query);
    return aggregateVisitsReport(allRangeVisits, filtered, query, now);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createGameStore(databaseUrl?: string): Promise<GameStore> {
  if (!databaseUrl) {
    return new InMemoryGameStore();
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000
  });

  try {
    await pool.query('SELECT 1');
    await pool
      .query(
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255) UNIQUE;
         ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
         ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_frame" varchar(32) NOT NULL DEFAULT 'default';
         UPDATE "users" SET "avatar_url" = 'preset:pilot' WHERE "avatar_url" IS NULL;
         ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_banned" boolean NOT NULL DEFAULT false;
         ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned_until" timestamp;
         ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;
         CREATE TABLE IF NOT EXISTS "admin_rewards" (
           "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
           "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
           "recipient_name" varchar(64) NOT NULL,
           "scope" varchar(24) DEFAULT 'single' NOT NULL,
           "coins_amount" integer DEFAULT 0 NOT NULL,
           "theme_code" varchar(64),
           "reason" text DEFAULT '' NOT NULL,
           "created_at" timestamp DEFAULT now() NOT NULL
         );
         CREATE TABLE IF NOT EXISTS "admin_settings" (
           "key" varchar(64) PRIMARY KEY NOT NULL,
           "value" text NOT NULL,
           "updated_at" timestamp DEFAULT now() NOT NULL
         );
         CREATE TABLE IF NOT EXISTS "site_visits" (
           "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
           "visit_token" varchar(64) NOT NULL UNIQUE,
           "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
           "device_id" varchar(128),
           "visitor_hash" varchar(64) NOT NULL,
           "is_returning" boolean DEFAULT false NOT NULL,
           "landing_path" varchar(255) DEFAULT '/' NOT NULL,
           "referrer_url" varchar(500),
           "referrer_host" varchar(128) DEFAULT 'direct' NOT NULL,
           "source_category" varchar(32) DEFAULT 'direct' NOT NULL,
           "utm_source" varchar(100),
           "utm_medium" varchar(100),
           "utm_campaign" varchar(120),
           "country_code" varchar(16) DEFAULT 'UNKNOWN' NOT NULL,
           "region" varchar(120),
           "city" varchar(120),
           "continent" varchar(16),
           "timezone" varchar(64),
           "language" varchar(32),
           "device_type" varchar(24) DEFAULT 'desktop' NOT NULL,
           "os_name" varchar(48) DEFAULT 'Diğer' NOT NULL,
           "os_version" varchar(32),
           "browser_name" varchar(48) DEFAULT 'Diğer' NOT NULL,
           "browser_version" varchar(32),
           "app_mode" varchar(24) DEFAULT 'browser' NOT NULL,
           "screen_width" integer,
           "screen_height" integer,
           "viewport_width" integer,
           "viewport_height" integer,
           "connection_type" varchar(24),
           "site_duration_sec" integer DEFAULT 0 NOT NULL,
           "play_duration_sec" integer DEFAULT 0 NOT NULL,
           "games_started" integer DEFAULT 0 NOT NULL,
           "games_completed" integer DEFAULT 0 NOT NULL,
           "best_score" integer DEFAULT 0 NOT NULL,
           "last_mode" varchar(16),
           "last_sides" integer,
           "last_layout" varchar(16),
           "is_playing_now" boolean DEFAULT false NOT NULL,
           "started_at" timestamp DEFAULT now() NOT NULL,
           "last_seen_at" timestamp DEFAULT now() NOT NULL
         );
         CREATE INDEX IF NOT EXISTS "site_visits_started_idx" ON "site_visits" ("started_at");
         CREATE INDEX IF NOT EXISTS "site_visits_last_seen_idx" ON "site_visits" ("last_seen_at");
         CREATE INDEX IF NOT EXISTS "site_visits_user_idx" ON "site_visits" ("user_id");
         CREATE INDEX IF NOT EXISTS "site_visits_geo_idx" ON "site_visits" ("country_code", "city");
         CREATE INDEX IF NOT EXISTS "site_visits_visitor_idx" ON "site_visits" ("visitor_hash");
         CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
           "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
           "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
           "email" varchar(255) NOT NULL,
           "code_hash" varchar(128) NOT NULL,
           "attempts" integer DEFAULT 0 NOT NULL,
           "expires_at" timestamp NOT NULL,
           "used_at" timestamp,
           "created_at" timestamp DEFAULT now() NOT NULL
         );
         CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens" ("email");
         CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_idx" ON "password_reset_tokens" ("expires_at");`
      )
      .catch(() => undefined);
    await syncShopCatalog(pool).catch(() => undefined);
    return new PostgresGameStore(pool);
  } catch {
    await pool.end().catch(() => undefined);
    return new InMemoryGameStore();
  }
}
