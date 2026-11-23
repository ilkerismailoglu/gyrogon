import { DEFAULT_SIDES, GameMode, PolygonSides, SUPPORTED_SIDES } from '@gyrogon/game-core';
import { Redis } from 'ioredis';
import {
  DEFAULT_AVATAR_FRAME,
  DEFAULT_AVATAR_URL,
  getIsoWeekKey,
  getUtcDateString
} from '../db/catalog.js';

export type LeaderboardBoard = 'classic' | 'weekly' | 'daily';

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

export interface RecordLeaderboardInput {
  mode: GameMode;
  sides?: PolygonSides;
  memberId: string;
  playerName: string;
  avatarUrl?: string;
  avatarFrame?: string;
  score: number;
  maxCombo: number;
  blocksCleared: number;
  dateStr?: string;
}

export interface LeaderboardSnapshot {
  board: LeaderboardBoard;
  sides: PolygonSides | 'all';
  periodKey: string;
  engine: 'redis' | 'memory';
  totalPlayers: number;
  entries: LeaderboardEntry[];
  me?: {
    rank: number;
    entry: LeaderboardEntry;
    around: LeaderboardEntry[];
  };
}

export interface LeaderboardEngine {
  readonly engineLabel: 'redis' | 'memory';
  recordScore(input: RecordLeaderboardInput): Promise<void>;
  getBoard(
    board: LeaderboardBoard,
    limit: number,
    memberId?: string,
    dateStr?: string,
    sides?: PolygonSides
  ): Promise<LeaderboardSnapshot>;
  removeMember(memberId: string): Promise<void>;
  close?(): Promise<void>;
}

interface StoredMeta {
  playerName: string;
  avatarUrl?: string;
  avatarFrame?: string;
  sides?: PolygonSides;
  maxCombo: number;
  blocksCleared: number;
  updatedAt: string;
}

function resolvePeriodKey(board: LeaderboardBoard, dateStr?: string): string {
  if (board === 'classic') return 'all-time';
  if (board === 'daily') return dateStr ?? getUtcDateString();
  const baseDate = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : new Date();
  return getIsoWeekKey(baseDate);
}

function zsetKey(board: LeaderboardBoard, periodKey: string, sides: PolygonSides): string {
  return `gyrogon:lb:${board}:s${sides}:${periodKey}`;
}

function metaKey(board: LeaderboardBoard, periodKey: string, sides: PolygonSides): string {
  return `gyrogon:lb:meta:${board}:s${sides}:${periodKey}`;
}

function allZsetKey(board: LeaderboardBoard, periodKey: string): string {
  return `gyrogon:lb:${board}:all:${periodKey}`;
}

function allMetaKey(board: LeaderboardBoard, periodKey: string): string {
  return `gyrogon:lb:meta:${board}:all:${periodKey}`;
}

/**
 * In-memory ZSET-compatible leaderboard engine used when Redis is unavailable or in unit tests.
 */
export class InMemoryLeaderboardEngine implements LeaderboardEngine {
  readonly engineLabel = 'memory' as const;
  private readonly boards = new Map<string, Map<string, { score: number; meta: StoredMeta }>>();

  constructor(seedShowcase = true) {
    if (seedShowcase) {
      const now = new Date().toISOString();
      const today = getUtcDateString();
      const week = getIsoWeekKey();

      const classicSeeds: Array<{
        memberId: string;
        score: number;
        sides: PolygonSides;
        meta: StoredMeta;
      }> = [
        {
          memberId: 'seed-nova',
          score: 2450,
          sides: 6,
          meta: {
            playerName: 'NovaHex',
            avatarUrl: 'preset:capybara',
            avatarFrame: 'default',
            sides: 6,
            maxCombo: 6,
            blocksCleared: 51,
            updatedAt: now
          }
        },
        {
          memberId: 'seed-cyber',
          score: 1680,
          sides: 5,
          meta: {
            playerName: 'CyberPulse',
            avatarUrl: 'preset:cloud',
            avatarFrame: 'default',
            sides: 5,
            maxCombo: 4,
            blocksCleared: 36,
            updatedAt: now
          }
        },
        {
          memberId: 'seed-star',
          score: 1340,
          sides: 7,
          meta: {
            playerName: 'StarVortex',
            avatarUrl: 'preset:fox',
            avatarFrame: 'default',
            sides: 7,
            maxCombo: 4,
            blocksCleared: 29,
            updatedAt: now
          }
        }
      ];

      for (const s of classicSeeds) {
        this.upsertInternal(zsetKey('classic', 'all-time', s.sides), s.memberId, s.score, s.meta);
        this.upsertInternal(allZsetKey('classic', 'all-time'), s.memberId, s.score, s.meta);
        this.upsertInternal(zsetKey('weekly', week, s.sides), s.memberId, s.score, s.meta);
        this.upsertInternal(allZsetKey('weekly', week), s.memberId, s.score, s.meta);
      }

      const dailySeeds: Array<{
        memberId: string;
        score: number;
        sides: PolygonSides;
        meta: StoredMeta;
      }> = [
        {
          memberId: 'seed-vortex',
          score: 1920,
          sides: 6,
          meta: {
            playerName: 'NeonVortex',
            avatarUrl: 'preset:dragon',
            avatarFrame: 'default',
            sides: 6,
            maxCombo: 5,
            blocksCleared: 42,
            updatedAt: now
          }
        },
        {
          memberId: 'seed-unicorn',
          score: 1450,
          sides: 5,
          meta: {
            playerName: 'GyroAce',
            avatarUrl: 'preset:unicorn',
            avatarFrame: 'default',
            sides: 5,
            maxCombo: 4,
            blocksCleared: 31,
            updatedAt: now
          }
        },
        {
          memberId: 'seed-owl',
          score: 980,
          sides: 4,
          meta: {
            playerName: 'PixelOwl',
            avatarUrl: 'preset:owl',
            avatarFrame: 'default',
            sides: 4,
            maxCombo: 3,
            blocksCleared: 22,
            updatedAt: now
          }
        }
      ];

      for (const s of dailySeeds) {
        this.upsertInternal(zsetKey('daily', today, s.sides), s.memberId, s.score, s.meta);
        this.upsertInternal(allZsetKey('daily', today), s.memberId, s.score, s.meta);
      }
    }
  }

  private upsertInternal(
    key: string,
    memberId: string,
    score: number,
    meta: StoredMeta
  ): void {
    let map = this.boards.get(key);
    if (!map) {
      map = new Map();
      this.boards.set(key, map);
    }
    const existing = map.get(memberId);
    if (!existing || score > existing.score) {
      map.set(memberId, { score, meta: { ...meta } });
    } else if (existing) {
      existing.meta.playerName = meta.playerName;
      if (meta.avatarUrl) existing.meta.avatarUrl = meta.avatarUrl;
      if (meta.avatarFrame) existing.meta.avatarFrame = meta.avatarFrame;
    }
  }

  async recordScore(input: RecordLeaderboardInput): Promise<void> {
    const sides = input.sides ?? DEFAULT_SIDES;
    const meta: StoredMeta = {
      playerName: input.playerName,
      avatarUrl: input.avatarUrl ?? DEFAULT_AVATAR_URL,
      avatarFrame: input.avatarFrame ?? DEFAULT_AVATAR_FRAME,
      sides,
      maxCombo: input.maxCombo,
      blocksCleared: input.blocksCleared,
      updatedAt: new Date().toISOString()
    };

    if (input.mode === 'classic') {
      this.upsertInternal(zsetKey('classic', 'all-time', sides), input.memberId, input.score, meta);
      this.upsertInternal(allZsetKey('classic', 'all-time'), input.memberId, input.score, meta);
      const weekKey = resolvePeriodKey('weekly', input.dateStr);
      this.upsertInternal(zsetKey('weekly', weekKey, sides), input.memberId, input.score, meta);
      this.upsertInternal(allZsetKey('weekly', weekKey), input.memberId, input.score, meta);
    } else {
      const dayKey = resolvePeriodKey('daily', input.dateStr);
      this.upsertInternal(zsetKey('daily', dayKey, sides), input.memberId, input.score, meta);
      this.upsertInternal(allZsetKey('daily', dayKey), input.memberId, input.score, meta);
    }
  }

  async getBoard(
    board: LeaderboardBoard,
    limit: number,
    memberId?: string,
    dateStr?: string,
    sides?: PolygonSides
  ): Promise<LeaderboardSnapshot> {
    const periodKey = resolvePeriodKey(board, dateStr);
    let sourceEntries: Map<string, { score: number; meta: StoredMeta }>;

    if (sides !== undefined) {
      sourceEntries = this.boards.get(zsetKey(board, periodKey, sides)) ?? new Map();
    } else {
      sourceEntries = new Map();
      const allMap = this.boards.get(allZsetKey(board, periodKey));
      if (allMap) {
        for (const [id, data] of allMap.entries()) {
          sourceEntries.set(id, data);
        }
      }
      for (const s of SUPPORTED_SIDES) {
        const subMap = this.boards.get(zsetKey(board, periodKey, s));
        if (!subMap) continue;
        for (const [id, data] of subMap.entries()) {
          const prev = sourceEntries.get(id);
          if (!prev || data.score > prev.score) {
            sourceEntries.set(id, {
              score: data.score,
              meta: { ...data.meta, sides: data.meta.sides ?? s }
            });
          }
        }
      }
    }

    const sorted = Array.from(sourceEntries.entries()).sort((a, b) => b[1].score - a[1].score);

    const toEntry = (idx: number, [id, data]: [string, { score: number; meta: StoredMeta }]): LeaderboardEntry => ({
      rank: idx + 1,
      memberId: id,
      playerName: data.meta.playerName,
      avatarUrl: data.meta.avatarUrl ?? DEFAULT_AVATAR_URL,
      avatarFrame: data.meta.avatarFrame ?? DEFAULT_AVATAR_FRAME,
      sides: data.meta.sides ?? (sides ?? DEFAULT_SIDES),
      score: data.score,
      maxCombo: data.meta.maxCombo,
      blocksCleared: data.meta.blocksCleared,
      updatedAt: data.meta.updatedAt
    });

    const entries = sorted.slice(0, limit).map((item, idx) => toEntry(idx, item));

    let me: LeaderboardSnapshot['me'];
    if (memberId) {
      const myIdx = sorted.findIndex(([id]) => id === memberId);
      if (myIdx >= 0) {
        const myItem = sorted[myIdx];
        if (myItem) {
          const start = Math.max(0, myIdx - 2);
          const end = Math.min(sorted.length, myIdx + 3);
          const around = sorted.slice(start, end).map((item, offset) => toEntry(start + offset, item));
          me = {
            rank: myIdx + 1,
            entry: toEntry(myIdx, myItem),
            around
          };
        }
      }
    }

    return {
      board,
      sides: sides ?? 'all',
      periodKey,
      engine: 'memory',
      totalPlayers: sorted.length,
      entries,
      me
    };
  }

  async removeMember(memberId: string): Promise<void> {
    for (const map of this.boards.values()) {
      map.delete(memberId);
    }
  }
}

/**
 * Production Redis ZSET leaderboard engine with graceful fallback on connection failure.
 */
export class RedisLeaderboardEngine implements LeaderboardEngine {
  readonly engineLabel = 'redis' as const;
  private readonly redis: Redis;
  private readonly fallback: InMemoryLeaderboardEngine;

  constructor(redisClient: Redis, fallback = new InMemoryLeaderboardEngine(false)) {
    this.redis = redisClient;
    this.fallback = fallback;
  }

  private async upsertZsetByKeys(
    zKey: string,
    mKey: string,
    memberId: string,
    score: number,
    meta: StoredMeta,
    ttlSeconds?: number
  ): Promise<void> {
    const prevRaw = await this.redis.zscore(zKey, memberId);
    const prevScore = prevRaw !== null ? Number(prevRaw) : -1;

    if (score > prevScore) {
      const pipeline = this.redis.pipeline();
      pipeline.zadd(zKey, score, memberId);
      pipeline.hset(mKey, memberId, JSON.stringify(meta));
      if (ttlSeconds) {
        pipeline.expire(zKey, ttlSeconds);
        pipeline.expire(mKey, ttlSeconds);
      }
      await pipeline.exec();
    }
  }

  async recordScore(input: RecordLeaderboardInput): Promise<void> {
    const sides = input.sides ?? DEFAULT_SIDES;
    const meta: StoredMeta = {
      playerName: input.playerName,
      avatarUrl: input.avatarUrl ?? DEFAULT_AVATAR_URL,
      avatarFrame: input.avatarFrame ?? DEFAULT_AVATAR_FRAME,
      sides,
      maxCombo: input.maxCombo,
      blocksCleared: input.blocksCleared,
      updatedAt: new Date().toISOString()
    };

    try {
      if (input.mode === 'classic') {
        await this.upsertZsetByKeys(
          zsetKey('classic', 'all-time', sides),
          metaKey('classic', 'all-time', sides),
          input.memberId,
          input.score,
          meta
        );
        await this.upsertZsetByKeys(
          allZsetKey('classic', 'all-time'),
          allMetaKey('classic', 'all-time'),
          input.memberId,
          input.score,
          meta
        );

        const weekKey = resolvePeriodKey('weekly', input.dateStr);
        const weeklyTtl = 60 * 60 * 24 * 21;
        await this.upsertZsetByKeys(
          zsetKey('weekly', weekKey, sides),
          metaKey('weekly', weekKey, sides),
          input.memberId,
          input.score,
          meta,
          weeklyTtl
        );
        await this.upsertZsetByKeys(
          allZsetKey('weekly', weekKey),
          allMetaKey('weekly', weekKey),
          input.memberId,
          input.score,
          meta,
          weeklyTtl
        );
      } else {
        const dayKey = resolvePeriodKey('daily', input.dateStr);
        const dailyTtl = 60 * 60 * 24 * 7;
        await this.upsertZsetByKeys(
          zsetKey('daily', dayKey, sides),
          metaKey('daily', dayKey, sides),
          input.memberId,
          input.score,
          meta,
          dailyTtl
        );
        await this.upsertZsetByKeys(
          allZsetKey('daily', dayKey),
          allMetaKey('daily', dayKey),
          input.memberId,
          input.score,
          meta,
          dailyTtl
        );
      }
    } catch {
      await this.fallback.recordScore(input);
    }
  }

  private async backfillUnifiedBoard(
    board: LeaderboardBoard,
    periodKey: string,
    allZKey: string,
    allMKey: string
  ): Promise<void> {
    const merged = new Map<string, { score: number; meta: StoredMeta }>();

    for (const s of SUPPORTED_SIDES) {
      const zKey = zsetKey(board, periodKey, s);
      const mKey = metaKey(board, periodKey, s);
      const raw = await this.redis.zrevrange(zKey, 0, 199, 'WITHSCORES');
      if (raw.length === 0) continue;

      const ids: string[] = [];
      const scs: number[] = [];
      for (let i = 0; i < raw.length; i += 2) {
        const id = raw[i];
        const sc = raw[i + 1];
        if (id !== undefined && sc !== undefined) {
          ids.push(id);
          scs.push(Number(sc));
        }
      }
      if (ids.length === 0) continue;

      const metaList = await this.redis.hmget(mKey, ...ids);
      for (let idx = 0; idx < ids.length; idx++) {
        const id = ids[idx]!;
        const sc = scs[idx] ?? 0;
        let parsed: StoredMeta = {
          playerName: 'GyroPilot',
          maxCombo: 1,
          blocksCleared: 0,
          updatedAt: new Date().toISOString(),
          sides: s
        };
        const metaRaw = metaList[idx];
        if (metaRaw) {
          try {
            parsed = { ...(JSON.parse(metaRaw) as StoredMeta), sides: s };
          } catch {
            // keep default
          }
        }
        const prev = merged.get(id);
        if (!prev || sc > prev.score) {
          merged.set(id, { score: sc, meta: parsed });
        }
      }
    }

    if (merged.size === 0) return;

    const pipeline = this.redis.pipeline();
    for (const [id, data] of merged.entries()) {
      pipeline.zadd(allZKey, data.score, id);
      pipeline.hset(allMKey, id, JSON.stringify(data.meta));
    }
    if (board === 'weekly') {
      pipeline.expire(allZKey, 60 * 60 * 24 * 21);
      pipeline.expire(allMKey, 60 * 60 * 24 * 21);
    } else if (board === 'daily') {
      pipeline.expire(allZKey, 60 * 60 * 24 * 7);
      pipeline.expire(allMKey, 60 * 60 * 24 * 7);
    }
    await pipeline.exec();
  }

  private async hydrateRange(
    zKey: string,
    mKey: string,
    start: number,
    stop: number,
    defaultSides?: PolygonSides
  ): Promise<LeaderboardEntry[]> {
    const raw = await this.redis.zrevrange(zKey, start, stop, 'WITHSCORES');
    if (raw.length === 0) return [];

    const memberIds: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const id = raw[i];
      const sc = raw[i + 1];
      if (id !== undefined && sc !== undefined) {
        memberIds.push(id);
        scores.push(Number(sc));
      }
    }

    const metaList = memberIds.length > 0 ? await this.redis.hmget(mKey, ...memberIds) : [];

    return memberIds.map((id, idx) => {
      let parsed: StoredMeta = {
        playerName: 'GyroPilot',
        avatarUrl: DEFAULT_AVATAR_URL,
        avatarFrame: DEFAULT_AVATAR_FRAME,
        maxCombo: 1,
        blocksCleared: 0,
        updatedAt: new Date().toISOString(),
        sides: defaultSides
      };
      const metaRaw = metaList[idx];
      if (metaRaw) {
        try {
          parsed = JSON.parse(metaRaw) as StoredMeta;
        } catch {
          // keep default
        }
      }
      return {
        rank: start + idx + 1,
        memberId: id,
        playerName: parsed.playerName,
        avatarUrl: parsed.avatarUrl ?? DEFAULT_AVATAR_URL,
        avatarFrame: parsed.avatarFrame ?? DEFAULT_AVATAR_FRAME,
        sides: parsed.sides ?? defaultSides ?? DEFAULT_SIDES,
        score: scores[idx] ?? 0,
        maxCombo: parsed.maxCombo,
        blocksCleared: parsed.blocksCleared,
        updatedAt: parsed.updatedAt
      };
    });
  }

  async getBoard(
    board: LeaderboardBoard,
    limit: number,
    memberId?: string,
    dateStr?: string,
    sides?: PolygonSides
  ): Promise<LeaderboardSnapshot> {
    const periodKey = resolvePeriodKey(board, dateStr);
    const zKey = sides !== undefined ? zsetKey(board, periodKey, sides) : allZsetKey(board, periodKey);
    const mKey = sides !== undefined ? metaKey(board, periodKey, sides) : allMetaKey(board, periodKey);

    try {
      let totalPlayers = await this.redis.zcard(zKey);
      if (sides === undefined && totalPlayers === 0) {
        await this.backfillUnifiedBoard(board, periodKey, zKey, mKey);
        totalPlayers = await this.redis.zcard(zKey);
      }

      const entries = await this.hydrateRange(zKey, mKey, 0, Math.max(0, limit - 1), sides);

      let me: LeaderboardSnapshot['me'];
      if (memberId) {
        const myRankZero = await this.redis.zrevrank(zKey, memberId);
        if (myRankZero !== null) {
          const start = Math.max(0, myRankZero - 2);
          const stop = myRankZero + 2;
          const around = await this.hydrateRange(zKey, mKey, start, stop, sides);
          const myEntry = around.find((e) => e.memberId === memberId);
          if (myEntry) {
            me = {
              rank: myRankZero + 1,
              entry: myEntry,
              around
            };
          }
        }
      }

      return {
        board,
        sides: sides ?? 'all',
        periodKey,
        engine: 'redis',
        totalPlayers,
        entries,
        me
      };
    } catch {
      return this.fallback.getBoard(board, limit, memberId, dateStr, sides);
    }
  }

  async removeMember(memberId: string): Promise<void> {
    try {
      const today = getUtcDateString();
      const week = getIsoWeekKey();
      const targets: Array<[LeaderboardBoard, string]> = [
        ['classic', 'all-time'],
        ['weekly', week],
        ['daily', today]
      ];
      const pipeline = this.redis.pipeline();
      for (const [b, p] of targets) {
        pipeline.zrem(allZsetKey(b, p), memberId);
        pipeline.hdel(allMetaKey(b, p), memberId);
        for (const sides of SUPPORTED_SIDES) {
          pipeline.zrem(zsetKey(b, p, sides), memberId);
          pipeline.hdel(metaKey(b, p, sides), memberId);
        }
      }
      await pipeline.exec();
    } catch {
      await this.fallback.removeMember(memberId);
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export async function createLeaderboardEngine(redisUrl?: string): Promise<LeaderboardEngine> {
  if (!redisUrl) {
    return new InMemoryLeaderboardEngine(true);
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: () => null
  });

  // Prevent unhandled error events when Redis is offline during local dev
  client.on('error', () => {
    // handled via connect catch
  });

  try {
    await client.connect();
    await client.ping();
    return new RedisLeaderboardEngine(client);
  } catch {
    client.disconnect();
    return new InMemoryLeaderboardEngine(true);
  }
}
