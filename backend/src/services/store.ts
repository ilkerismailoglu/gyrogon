import crypto from 'node:crypto';
import { DEFAULT_SIDES, GameMode, PolygonSides, getDailySeed } from '@gyrogon/game-core';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  DAILY_QUEST_TEMPLATES,
  DEFAULT_SHOP_ITEMS,
  STREAK_REWARDS,
  ShopItemDef,
  getPreviousUtcDateString,
  getUtcDateString
} from '../db/catalog.js';
import * as schema from '../db/schema.js';
import { VerifiedSocialIdentity } from './oauth.js';

export interface PlayerProfile {
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
  linkedProviders: {
    apple: boolean;
    google: boolean;
    facebook: boolean;
  };
  canClaimStreakToday: boolean;
  nextStreakDay: number;
  nextStreakReward: number;
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

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface GameStore {
  readonly modeLabel: 'postgres' | 'memory';
  getOrCreatePlayer(deviceId: string, displayName?: string, today?: string): Promise<PlayerProfile>;
  getPlayerById(userId: string, today?: string): Promise<PlayerProfile | undefined>;
  updateDisplayName(userId: string, displayName: string, today?: string): Promise<PlayerProfile>;
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

  grantAdReward(params: {
    transactionId: string;
    userId: string;
    rewardItem: string;
    rewardAmount: number;
    keyId: string;
  }): Promise<{ granted: boolean; duplicate: boolean; hexaCoins: number }>;

  close?(): Promise<void>;
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
interface MemUser {
  id: string;
  guestDeviceId: string;
  displayName: string;
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
}

export class InMemoryGameStore implements GameStore {
  readonly modeLabel = 'memory' as const;
  private readonly usersById = new Map<string, MemUser>();
  private readonly userIdByDevice = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly scores: StoredScore[] = [];
  private readonly questsByKey = new Map<string, QuestProgressItem[]>();
  private readonly processedAdTransactions = new Set<string>();

  private toProfile(u: MemUser, today: string): PlayerProfile {
    const streakInfo = computeNextStreakInfo(u.streakCount, u.lastStreakClaimDate, today);
    return {
      id: u.id,
      guestDeviceId: u.guestDeviceId,
      displayName: u.displayName,
      hexaCoins: u.hexaCoins,
      streakCount: u.streakCount,
      lastStreakClaimDate: u.lastStreakClaimDate,
      highScoreClassic: u.highScoreClassic,
      highScoreDaily: u.highScoreDaily,
      equippedTheme: u.equippedTheme,
      unlockedItems: Array.from(u.unlockedItems),
      linkedProviders: {
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

  async getOrCreatePlayer(
    deviceId: string,
    displayName?: string,
    today = getUtcDateString()
  ): Promise<PlayerProfile> {
    const existingId = this.userIdByDevice.get(deviceId);
    if (existingId) {
      const user = this.usersById.get(existingId);
      if (user) {
        user.lastLoginDate = today;
        if (displayName && displayName.trim().length > 0 && user.displayName === 'GyroPilot') {
          user.displayName = displayName.trim().slice(0, 32);
        }
        return this.toProfile(user, today);
      }
    }

    const user: MemUser = {
      id: crypto.randomUUID(),
      guestDeviceId: deviceId,
      displayName: displayName?.trim().slice(0, 32) || 'GyroPilot',
      appleSub: null,
      googleSub: null,
      facebookId: null,
      hexaCoins: 100,
      streakCount: 0,
      lastLoginDate: today,
      lastStreakClaimDate: null,
      highScoreClassic: 0,
      highScoreDaily: 0,
      equippedTheme: 'hextris',
      unlockedItems: new Set(['hextris', 'cyberpunk'])
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
    const user = this.usersById.get(userId);
    if (!user) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    user.displayName = displayName.trim().slice(0, 32) || 'GyroPilot';
    return this.toProfile(user, today);
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

    if (existingOwner) {
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
    if (identity.displayName && current.displayName === 'GyroPilot') {
      current.displayName = identity.displayName.slice(0, 32);
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
    const set = new Set<string>(['hextris', 'cyberpunk', ...rows.map((r) => r.itemCode)]);
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
      displayName: row.displayName,
      hexaCoins: row.hexaCoins,
      streakCount: row.streakCount,
      lastStreakClaimDate: row.lastStreakClaimDate,
      highScoreClassic: row.highScoreClassic,
      highScoreDaily: row.highScoreDaily,
      equippedTheme: row.equippedTheme,
      unlockedItems,
      linkedProviders: {
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
        .onConflictDoNothing({ target: schema.shopItems.code });
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

  async getOrCreatePlayer(
    deviceId: string,
    displayName?: string,
    today = getUtcDateString()
  ): Promise<PlayerProfile> {
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.guestDeviceId, deviceId))
      .limit(1);

    if (existing[0]) {
      return this.hydrateProfile(existing[0], today);
    }

    await this.ensureDefaultShopSeeded();
    const [created] = await this.db
      .insert(schema.users)
      .values({
        guestDeviceId: deviceId,
        displayName: displayName?.trim().slice(0, 32) || 'GyroPilot',
        hexaCoins: 100,
        lastLoginDate: today,
        equippedTheme: 'hextris'
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
        { userId: row.id, itemCode: 'hextris' },
        { userId: row.id, itemCode: 'cyberpunk' }
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
    const [updated] = await this.db
      .update(schema.users)
      .set({ displayName: displayName.trim().slice(0, 32) || 'GyroPilot', updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();

    if (!updated) throw new StoreError(404, 'USER_NOT_FOUND', 'Player not found');
    return this.hydrateProfile(updated, today);
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
      if (owned[0] || itemCode === 'hextris' || itemCode === 'cyberpunk') {
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
        unlockedItems: Array.from(new Set(['hextris', 'cyberpunk', ...inv.map((r) => r.itemCode)])),
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

      const [existingOwner] = await tx
        .select()
        .from(schema.users)
        .where(providerCondition)
        .limit(1);

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

        const [merged] = await tx
          .update(schema.users)
          .set({
            hexaCoins: sql`${schema.users.hexaCoins} + ${current.hexaCoins}`,
            highScoreClassic: sql`GREATEST(${schema.users.highScoreClassic}, ${current.highScoreClassic})`,
            highScoreDaily: sql`GREATEST(${schema.users.highScoreDaily}, ${current.highScoreDaily})`,
            guestDeviceId: current.guestDeviceId ?? existingOwner.guestDeviceId,
            updatedAt: new Date()
          })
          .where(eq(schema.users.id, existingOwner.id))
          .returning();

        await tx.delete(schema.users).where(eq(schema.users.id, current.id));
        return { row: merged ?? existingOwner, mergedFromUserId: current.id };
      }

      const updateFields: Partial<typeof schema.users.$inferInsert> = {
        updatedAt: new Date()
      };
      if (identity.provider === 'apple') updateFields.appleSub = identity.providerSub;
      if (identity.provider === 'google') updateFields.googleSub = identity.providerSub;
      if (identity.provider === 'facebook') updateFields.facebookId = identity.providerSub;
      if (identity.avatarUrl) updateFields.avatarUrl = identity.avatarUrl;
      if (identity.displayName && current.displayName === 'GyroPilot') {
        updateFields.displayName = identity.displayName.slice(0, 32);
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

  async getTopScoresForWarmup(mode: GameMode, limit = 100) {
    return this.db
      .select()
      .from(schema.scores)
      .where(eq(schema.scores.mode, mode))
      .orderBy(desc(schema.scores.score))
      .limit(limit);
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
    return new PostgresGameStore(pool);
  } catch {
    await pool.end().catch(() => undefined);
    return new InMemoryGameStore();
  }
}
