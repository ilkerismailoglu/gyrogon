import { DEFAULT_SIDES, GameMode, PolygonSides, SUPPORTED_SIDES } from '@gyrogon/game-core';
import { Redis } from 'ioredis';
import { getIsoWeekKey, getUtcDateString } from '../db/catalog.js';

export type LeaderboardBoard = 'classic' | 'weekly' | 'daily';

export interface LeaderboardEntry {
  rank: number;
  memberId: string;
  playerName: string;
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
  score: number;
  maxCombo: number;
  blocksCleared: number;
  dateStr?: string;
}

export interface LeaderboardSnapshot {
  board: LeaderboardBoard;
  sides: PolygonSides;
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
      this.upsertInternal(zsetKey('classic', 'all-time', 6), 'seed-nova', 2450, {
        playerName: 'NovaHex',
        maxCombo: 6,
        blocksCleared: 51,
        updatedAt: now
      });
      this.upsertInternal(zsetKey('classic', 'all-time', 6), 'seed-cyber', 1680, {
        playerName: 'CyberPulse',
        maxCombo: 4,
        blocksCleared: 36,
        updatedAt: now
      });
      this.upsertInternal(zsetKey('weekly', week, 6), 'seed-nova', 2450, {
        playerName: 'NovaHex',
        maxCombo: 6,
        blocksCleared: 51,
        updatedAt: now
      });
      this.upsertInternal(zsetKey('weekly', week, 6), 'seed-cyber', 1680, {
        playerName: 'CyberPulse',
        maxCombo: 4,
        blocksCleared: 36,
        updatedAt: now
      });
      this.upsertInternal(zsetKey('daily', today, 6), 'seed-vortex', 1920, {
        playerName: 'NeonVortex',
        maxCombo: 5,
        blocksCleared: 42,
        updatedAt: now
      });
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
      map.set(memberId, { score, meta });
    } else if (existing && existing.meta.playerName !== meta.playerName) {
      existing.meta.playerName = meta.playerName;
    }
  }

  async recordScore(input: RecordLeaderboardInput): Promise<void> {
    const sides = input.sides ?? DEFAULT_SIDES;
    const meta: StoredMeta = {
      playerName: input.playerName,
      maxCombo: input.maxCombo,
      blocksCleared: input.blocksCleared,
      updatedAt: new Date().toISOString()
    };

    if (input.mode === 'classic') {
      this.upsertInternal(zsetKey('classic', 'all-time', sides), input.memberId, input.score, meta);
      const weekKey = resolvePeriodKey('weekly', input.dateStr);
      this.upsertInternal(zsetKey('weekly', weekKey, sides), input.memberId, input.score, meta);
    } else {
      const dayKey = resolvePeriodKey('daily', input.dateStr);
      this.upsertInternal(zsetKey('daily', dayKey, sides), input.memberId, input.score, meta);
    }
  }

  async getBoard(
    board: LeaderboardBoard,
    limit: number,
    memberId?: string,
    dateStr?: string,
    sides: PolygonSides = DEFAULT_SIDES
  ): Promise<LeaderboardSnapshot> {
    const periodKey = resolvePeriodKey(board, dateStr);
    const map = this.boards.get(zsetKey(board, periodKey, sides));
    const sorted = map
      ? Array.from(map.entries()).sort((a, b) => b[1].score - a[1].score)
      : [];

    const toEntry = (idx: number, [id, data]: [string, { score: number; meta: StoredMeta }]): LeaderboardEntry => ({
      rank: idx + 1,
      memberId: id,
      playerName: data.meta.playerName,
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
      sides,
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

  private async upsertZset(
    board: LeaderboardBoard,
    periodKey: string,
    sides: PolygonSides,
    memberId: string,
    score: number,
    meta: StoredMeta,
    ttlSeconds?: number
  ): Promise<void> {
    const zKey = zsetKey(board, periodKey, sides);
    const mKey = metaKey(board, periodKey, sides);
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
      maxCombo: input.maxCombo,
      blocksCleared: input.blocksCleared,
      updatedAt: new Date().toISOString()
    };

    try {
      if (input.mode === 'classic') {
        await this.upsertZset('classic', 'all-time', sides, input.memberId, input.score, meta);
        const weekKey = resolvePeriodKey('weekly', input.dateStr);
        await this.upsertZset('weekly', weekKey, sides, input.memberId, input.score, meta, 60 * 60 * 24 * 21);
      } else {
        const dayKey = resolvePeriodKey('daily', input.dateStr);
        await this.upsertZset('daily', dayKey, sides, input.memberId, input.score, meta, 60 * 60 * 24 * 7);
      }
    } catch {
      await this.fallback.recordScore(input);
    }
  }

  private async hydrateRange(
    zKey: string,
    mKey: string,
    start: number,
    stop: number
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
        maxCombo: 1,
        blocksCleared: 0,
        updatedAt: new Date().toISOString()
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
    sides: PolygonSides = DEFAULT_SIDES
  ): Promise<LeaderboardSnapshot> {
    const periodKey = resolvePeriodKey(board, dateStr);
    const zKey = zsetKey(board, periodKey, sides);
    const mKey = metaKey(board, periodKey, sides);

    try {
      const [totalPlayers, entries] = await Promise.all([
        this.redis.zcard(zKey),
        this.hydrateRange(zKey, mKey, 0, Math.max(0, limit - 1))
      ]);

      let me: LeaderboardSnapshot['me'];
      if (memberId) {
        const myRankZero = await this.redis.zrevrank(zKey, memberId);
        if (myRankZero !== null) {
          const start = Math.max(0, myRankZero - 2);
          const stop = myRankZero + 2;
          const around = await this.hydrateRange(zKey, mKey, start, stop);
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
        sides,
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
      for (const sides of SUPPORTED_SIDES) {
        for (const [b, p] of targets) {
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
