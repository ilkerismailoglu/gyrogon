import { PolygonSides, isSupportedSides } from '@gyrogon/game-core';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  hashPassword,
  issueAdminToken,
  verifyAdminPassword,
  verifyAdminToken,
  verifyPassword
} from '../services/auth.js';
import { LeaderboardEngine } from '../services/leaderboard.js';
import { GameStore, StoreError } from '../services/store.js';

const AdminLoginBody = z.object({
  password: z.string().min(1).max(200)
});

const AdminUuidParams = z.object({
  id: z.string().uuid()
});

const AdminPlayersQuery = z.object({
  q: z.string().trim().max(128).optional(),
  accountType: z.enum(['all', 'registered', 'guest', 'banned']).default('all'),
  provider: z.enum(['all', 'email', 'google', 'facebook', 'apple']).default('all'),
  sort: z
    .enum(['newest', 'best_score', 'most_games', 'most_coins', 'last_active'])
    .default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const AdminPatchPlayerBody = z.object({
  displayName: z.string().trim().min(1).max(32).optional(),
  hexaCoins: z.number().int().min(0).max(10_000_000).optional(),
  coinsDelta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  streakCount: z.number().int().min(0).max(365).optional(),
  unlockThemeCode: z.string().trim().min(1).max(64).optional(),
  equippedTheme: z.string().trim().min(1).max(64).optional()
});

const AdminBanBody = z.object({
  permanent: z.boolean().default(false),
  durationHours: z.number().positive().max(24 * 365 * 5).optional(),
  reason: z.string().trim().max(300).optional(),
  removeFromLeaderboard: z.boolean().default(true)
});

const AdminGrantRewardBody = z.object({
  scope: z.enum(['single', 'registered', 'all']).default('single'),
  userId: z.string().uuid().optional(),
  coinsAmount: z.number().int().min(0).max(1_000_000).default(0),
  themeCode: z.string().trim().min(1).max(64).optional(),
  reason: z.string().trim().max(300).optional()
});

const AdminChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200)
});

const AdminSidesSchema = z.coerce
  .number()
  .int()
  .refine((v): v is PolygonSides => isSupportedSides(v), {
    message: 'sides must be one of 3, 4, 5, 6, 7, 8'
  });

const AdminScoresQuery = z.object({
  q: z.string().trim().max(128).optional(),
  mode: z.enum(['all', 'classic', 'daily']).default('all'),
  sides: AdminSidesSchema.optional(),
  sort: z.enum(['newest', 'score', 'blocks', 'combo']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const AdminAnalyticsQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d', '90d', 'all']).default('7d'),
  country: z.string().trim().max(16).optional(),
  deviceType: z.enum(['all', 'mobile', 'tablet', 'desktop']).default('all'),
  source: z.enum(['all', 'direct', 'search', 'social', 'campaign', 'referral']).default('all')
});

function extractAdminBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

function requireAdmin(request: FastifyRequest): void {
  const token = extractAdminBearer(request);
  if (!token || !verifyAdminToken(token)) {
    throw new StoreError(
      401,
      'ADMIN_UNAUTHORIZED',
      'Yönetici oturumu gerekli veya süresi dolmuş.'
    );
  }
}

export function registerAdminRoutes(
  api: FastifyInstance,
  deps: { store: GameStore; leaderboard: LeaderboardEngine }
): void {
  const { store, leaderboard } = deps;
  const typedApi = api.withTypeProvider<ZodTypeProvider>();

  async function verifyCurrentAdminSecret(
    candidate: string
  ): Promise<{ ok: boolean; misconfigured?: boolean; source: 'database' | 'env' | 'dev_default' }> {
    const dbHash = await store.getAdminPasswordHash();
    if (dbHash) {
      return { ok: verifyPassword(candidate, dbHash), source: 'database' };
    }
    const check = verifyAdminPassword(candidate);
    const source = process.env.ADMIN_PASSWORD?.trim() ? 'env' : 'dev_default';
    return { ...check, source };
  }

  typedApi.post(
    '/api/admin/login',
    {
      schema: { body: AdminLoginBody }
    },
    async (request, reply) => {
      const check = await verifyCurrentAdminSecret(request.body.password);
      if (check.misconfigured) {
        return reply.status(503).send({
          error: 'ADMIN_PASSWORD ortam değişkeni üretim ortamında tanımlanmamış.'
        });
      }
      if (!check.ok) {
        return reply.status(401).send({
          error: 'Yönetici şifresi hatalı.'
        });
      }
      const issued = issueAdminToken();
      return {
        ...issued,
        role: 'admin' as const
      };
    }
  );

  typedApi.get('/api/admin/me', async (request) => {
    requireAdmin(request);
    return {
      authenticated: true,
      store: store.modeLabel,
      leaderboard: leaderboard.engineLabel,
      timestamp: new Date().toISOString()
    };
  });

  typedApi.get('/api/admin/overview', async (request) => {
    requireAdmin(request);
    const [overview, dailySeed] = await Promise.all([
      store.getAdminOverview(),
      store.getDailySeedInfo()
    ]);
    return {
      overview,
      dailySeed,
      system: {
        store: store.modeLabel,
        leaderboard: leaderboard.engineLabel,
        timestamp: new Date().toISOString()
      }
    };
  });

  typedApi.get(
    '/api/admin/players',
    {
      schema: { querystring: AdminPlayersQuery }
    },
    async (request) => {
      requireAdmin(request);
      return store.listAdminPlayers(request.query);
    }
  );

  typedApi.get(
    '/api/admin/players/:id',
    {
      schema: { params: AdminUuidParams }
    },
    async (request) => {
      requireAdmin(request);
      const detail = await store.getAdminPlayerDetail(request.params.id);
      if (!detail) {
        throw new StoreError(404, 'USER_NOT_FOUND', 'Oyuncu bulunamadı.');
      }
      return detail;
    }
  );

  typedApi.patch(
    '/api/admin/players/:id',
    {
      schema: {
        params: AdminUuidParams,
        body: AdminPatchPlayerBody
      }
    },
    async (request) => {
      requireAdmin(request);
      return store.updateAdminPlayer(request.params.id, request.body);
    }
  );

  typedApi.post(
    '/api/admin/players/:id/ban',
    {
      schema: {
        params: AdminUuidParams,
        body: AdminBanBody
      }
    },
    async (request, reply) => {
      requireAdmin(request);
      if (!request.body.permanent && !request.body.durationHours) {
        return reply.status(400).send({
          error: 'Süreli yasaklama için süre (saat) belirtmelisin.'
        });
      }
      const detail = await store.banPlayer(request.params.id, {
        durationHours: request.body.permanent ? null : request.body.durationHours,
        reason: request.body.reason
      });
      if (request.body.removeFromLeaderboard) {
        await leaderboard.removeMember(request.params.id);
      }
      return detail;
    }
  );

  typedApi.post(
    '/api/admin/players/:id/unban',
    {
      schema: {
        params: AdminUuidParams
      }
    },
    async (request) => {
      requireAdmin(request);
      return store.unbanPlayer(request.params.id);
    }
  );

  typedApi.post(
    '/api/admin/rewards/grant',
    {
      schema: { body: AdminGrantRewardBody }
    },
    async (request) => {
      requireAdmin(request);
      return store.grantAdminReward(request.body);
    }
  );

  typedApi.get('/api/admin/rewards', async (request) => {
    requireAdmin(request);
    const items = await store.listAdminRewards(50);
    return { items };
  });

  typedApi.get('/api/admin/settings', async (request) => {
    requireAdmin(request);
    const dbHash = await store.getAdminPasswordHash();
    const passwordSource: 'database' | 'env' | 'dev_default' = dbHash
      ? 'database'
      : process.env.ADMIN_PASSWORD?.trim()
        ? 'env'
        : 'dev_default';
    return {
      passwordSource,
      isProduction: process.env.NODE_ENV === 'production'
    };
  });

  typedApi.post(
    '/api/admin/settings/password',
    {
      schema: { body: AdminChangePasswordBody }
    },
    async (request, reply) => {
      requireAdmin(request);
      const check = await verifyCurrentAdminSecret(request.body.currentPassword);
      if (!check.ok) {
        return reply.status(401).send({
          error: 'Mevcut yönetici şifresi hatalı.'
        });
      }
      const hashed = hashPassword(request.body.newPassword);
      await store.setAdminPasswordHash(hashed);
      const issued = issueAdminToken();
      return {
        changed: true,
        ...issued,
        passwordSource: 'database' as const
      };
    }
  );

  typedApi.delete(
    '/api/admin/players/:id',
    {
      schema: { params: AdminUuidParams }
    },
    async (request) => {
      requireAdmin(request);
      const result = await store.deleteUserAccount(request.params.id);
      if (result.deleted) {
        await leaderboard.removeMember(request.params.id);
      }
      return result;
    }
  );

  typedApi.get(
    '/api/admin/scores',
    {
      schema: { querystring: AdminScoresQuery }
    },
    async (request) => {
      requireAdmin(request);
      return store.listAdminScores(request.query);
    }
  );

  typedApi.get(
    '/api/admin/analytics',
    {
      schema: { querystring: AdminAnalyticsQuerySchema }
    },
    async (request) => {
      requireAdmin(request);
      return store.getAdminAnalytics(request.query);
    }
  );

  typedApi.delete(
    '/api/admin/scores/:id',
    {
      schema: { params: AdminUuidParams }
    },
    async (request) => {
      requireAdmin(request);
      const result = await store.deleteAdminScore(request.params.id);
      if (!result.deleted) {
        throw new StoreError(404, 'SCORE_NOT_FOUND', 'Oyun skoru bulunamadı.');
      }
      return {
        deleted: true,
        scoreId: request.params.id
      };
    }
  );
}
