import crypto from 'node:crypto';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { DEFAULT_SIDES, PolygonSides, getDailySeed, isSupportedSides } from '@gyrogon/game-core';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import {
  ZodTypeProvider,
  serializerCompiler,
  validatorCompiler
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { STREAK_REWARDS } from './db/catalog.js';
import {
  AdMobKeyProvider,
  createGoogleAdMobKeyProvider,
  verifyAdMobSsvCallback
} from './services/admobSsv.js';
import {
  hashMoveStream,
  signSessionToken,
  verifySessionSubmission,
  verifySessionToken
} from './services/antiCheat.js';
import { issueTokenPair, verifyJwtToken } from './services/auth.js';
import {
  InMemoryLeaderboardEngine,
  LeaderboardBoard,
  LeaderboardEngine
} from './services/leaderboard.js';
import { OAuthVerifier, createProductionOAuthVerifier } from './services/oauth.js';
import { GameStore, InMemoryGameStore, PlayerProfile, StoreError } from './services/store.js';

export interface BuildAppOptions {
  store?: GameStore;
  leaderboard?: LeaderboardEngine;
  oauthVerifier?: OAuthVerifier;
  adMobKeyProvider?: AdMobKeyProvider;
  logger?: boolean;
  rateLimitMax?: number;
}

const GuestAuthBody = z.object({
  deviceId: z.string().trim().min(3).max(128),
  displayName: z.string().trim().min(1).max(32).optional()
});

const RefreshAuthBody = z.object({
  refreshToken: z.string().min(10)
});

const LinkProviderParams = z.object({
  provider: z.enum(['apple', 'google', 'facebook'])
});

const LinkProviderBody = z.object({
  token: z.string().min(3)
});

const FacebookDeletionBody = z.object({
  signed_request: z.string().min(5)
});

const SidesSchema = z.coerce
  .number()
  .int()
  .refine((v): v is PolygonSides => isSupportedSides(v), {
    message: 'sides must be one of 3, 4, 5, 6, 7, 8'
  });

const StartSessionBody = z.object({
  mode: z.enum(['classic', 'daily']).default('classic'),
  sides: SidesSchema.default(DEFAULT_SIDES),
  playerName: z.string().trim().min(1).max(32).default('GyroPilot'),
  deviceId: z.string().trim().min(3).max(128).optional()
});

const MoveSchema = z.object({
  tick: z.number().int().nonnegative(),
  action: z.enum([
    'ROTATE_LEFT',
    'ROTATE_RIGHT',
    'FAST_DROP_ON',
    'FAST_DROP_OFF',
    'REVIVE'
  ])
});

const SubmitSessionBody = z.object({
  sessionId: z.string().min(1),
  signature: z.string().min(1),
  claimedScore: z.number().int().nonnegative(),
  moves: z.array(MoveSchema).max(20000),
  playerName: z.string().trim().min(1).max(32).optional()
});

const LeaderboardQuery = z.object({
  mode: z.enum(['classic', 'weekly', 'daily']).optional(),
  sides: SidesSchema.default(DEFAULT_SIDES),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  deviceId: z.string().trim().min(3).max(128).optional()
});

const LeaderboardParams = z.object({
  board: z.enum(['classic', 'weekly', 'daily'])
});

const ShopActionBody = z.object({
  itemCode: z.string().trim().min(1).max(64)
});

const QuestClaimBody = z.object({
  questCode: z.string().trim().min(1).max(32)
});

const UpdateProfileBody = z.object({
  displayName: z.string().trim().min(1).max(32)
});

function extractDeviceId(request: FastifyRequest, explicit?: string): string {
  const headerVal = request.headers['x-device-id'];
  if (typeof headerVal === 'string' && headerVal.trim().length >= 3) {
    return headerVal.trim().slice(0, 128);
  }
  if (explicit && explicit.trim().length >= 3) {
    return explicit.trim().slice(0, 128);
  }
  const queryDevice = (request.query as Record<string, unknown> | undefined)?.deviceId;
  if (typeof queryDevice === 'string' && queryDevice.trim().length >= 3) {
    return queryDevice.trim().slice(0, 128);
  }
  return 'anonymous-default-device';
}

function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const store = options.store ?? new InMemoryGameStore();
  const leaderboard = options.leaderboard ?? new InMemoryLeaderboardEngine(true);
  const oauthVerifier = options.oauthVerifier ?? createProductionOAuthVerifier();
  const adMobKeyProvider = options.adMobKeyProvider ?? createGoogleAdMobKeyProvider();

  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof StoreError) {
      return reply.status(err.statusCode).send({
        error: err.message,
        code: err.code
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({
      error: err instanceof Error ? err.message : 'Internal Server Error'
    });
  });

  const rawCorsOrigin = process.env.CORS_ORIGIN;
  const corsOrigin = rawCorsOrigin
    ? rawCorsOrigin.includes(',')
      ? rawCorsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
      : rawCorsOrigin.trim()
    : true;

  app.register(cors, {
    origin: corsOrigin
  });

  app.register(rateLimit, {
    max: options.rateLimitMax ?? 180,
    timeWindow: '1 minute'
  });

  async function resolvePlayer(
    request: FastifyRequest,
    explicitDeviceId?: string,
    displayName?: string
  ): Promise<PlayerProfile> {
    const bearer = extractBearerToken(request);
    if (bearer) {
      const payload = verifyJwtToken(bearer, 'access');
      if (!payload) {
        throw new StoreError(401, 'INVALID_TOKEN', 'Invalid or expired access token');
      }
      const existing = await store.getPlayerById(payload.sub);
      if (existing) return existing;
    }
    const deviceId = extractDeviceId(request, explicitDeviceId);
    return store.getOrCreatePlayer(deviceId, displayName);
  }

  app.register(async (api) => {
    const typedApi = api.withTypeProvider<ZodTypeProvider>();

    // ===================== SYSTEM & DAILY =====================
    typedApi.get('/api/health', async () => {
      return {
        ok: true,
        service: 'gyrogon-backend',
        store: store.modeLabel,
        leaderboard: leaderboard.engineLabel,
        timestamp: new Date().toISOString()
      };
    });

    typedApi.get('/api/daily', async () => {
      return store.getDailySeedInfo();
    });

    // ===================== AUTH (GUEST-FIRST JWT + SOCIAL LINKING) =====================
    typedApi.post(
      '/api/auth/guest',
      {
        schema: { body: GuestAuthBody }
      },
      async (request) => {
        const player = await store.getOrCreatePlayer(
          request.body.deviceId,
          request.body.displayName
        );
        const tokens = issueTokenPair(player.id, player.guestDeviceId);
        return {
          ...tokens,
          player
        };
      }
    );

    typedApi.post(
      '/api/auth/refresh',
      {
        schema: { body: RefreshAuthBody }
      },
      async (request, reply) => {
        const payload = verifyJwtToken(request.body.refreshToken, 'refresh');
        if (!payload) {
          return reply.status(401).send({ error: 'Invalid or expired refresh token' });
        }
        const player = await store.getPlayerById(payload.sub);
        if (!player) {
          return reply.status(404).send({ error: 'Account no longer exists' });
        }
        const tokens = issueTokenPair(player.id, player.guestDeviceId);
        return { ...tokens, player };
      }
    );

    typedApi.post(
      '/api/auth/link/:provider',
      {
        schema: {
          params: LinkProviderParams,
          body: LinkProviderBody
        }
      },
      async (request, reply) => {
        const currentPlayer = await resolvePlayer(request);
        let identity;
        try {
          identity = await oauthVerifier.verifyToken(request.params.provider, request.body.token);
        } catch (err) {
          return reply.status(401).send({
            error: err instanceof Error ? err.message : 'OAuth token verification failed'
          });
        }

        const { player, mergedFromUserId } = await store.linkSocialAccount(
          currentPlayer.id,
          identity
        );
        if (mergedFromUserId) {
          await leaderboard.removeMember(mergedFromUserId);
        }

        const tokens = issueTokenPair(player.id, player.guestDeviceId);
        return {
          linked: true,
          provider: identity.provider,
          merged: Boolean(mergedFromUserId),
          ...tokens,
          player
        };
      }
    );

    // ===================== APP STORE 4.8 & GDPR/KVKK ACCOUNT DELETION =====================
    typedApi.delete('/api/users/me', async (request) => {
      const player = await resolvePlayer(request);
      const result = await store.deleteUserAccount(player.id);
      await leaderboard.removeMember(player.id);
      return {
        deleted: result.deleted,
        userId: player.id,
        deletedAt: new Date().toISOString()
      };
    });

    typedApi.post(
      '/api/auth/facebook/data-deletion',
      {
        schema: { body: FacebookDeletionBody }
      },
      async (request, reply) => {
        const parsed = oauthVerifier.verifyFacebookSignedRequest(request.body.signed_request);
        if (!parsed) {
          return reply.status(400).send({ error: 'Invalid Facebook signed_request' });
        }
        const res = await store.deleteByFacebookId(parsed.userId);
        if (res.deletedUserId) {
          await leaderboard.removeMember(res.deletedUserId);
        }
        const confirmationCode = `HEXDEL-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const domain = process.env.GYROGON_DOMAIN ?? process.env.HEXACORE_DOMAIN ?? 'localhost';
        return {
          url: `https://${domain}/privacy.html?deletion=${confirmationCode}`,
          confirmation_code: confirmationCode,
          deleted: res.deleted
        };
      }
    );

    // ===================== ADMOB SERVER-SIDE VERIFICATION (SSV) =====================
    typedApi.get('/api/ads/ssv', async (request, reply) => {
      const rawUrl = request.raw.url ?? '';
      const qIdx = rawUrl.indexOf('?');
      const rawQuery = qIdx >= 0 ? rawUrl.slice(qIdx + 1) : '';

      const verification = await verifyAdMobSsvCallback(rawQuery, adMobKeyProvider);
      if (!verification.valid || !verification.transactionId || !verification.userId || !verification.keyId) {
        return reply.status(400).send({
          verified: false,
          error: verification.reason ?? 'Invalid AdMob SSV callback'
        });
      }

      const result = await store.grantAdReward({
        transactionId: verification.transactionId,
        userId: verification.userId,
        rewardItem: verification.rewardItem ?? 'hexa_coins',
        rewardAmount: verification.rewardAmount ?? 50,
        keyId: verification.keyId
      });

      return {
        verified: true,
        transactionId: verification.transactionId,
        granted: result.granted,
        duplicate: result.duplicate,
        hexaCoins: result.hexaCoins
      };
    });

    // ===================== PLAYER PROFILE & STREAK =====================
    typedApi.get('/api/player/profile', async (request) => {
      const player = await resolvePlayer(request);
      const quests = await store.getDailyQuests(player.id);
      return {
        player,
        quests,
        streakRewards: STREAK_REWARDS
      };
    });

    typedApi.patch(
      '/api/player/profile',
      {
        schema: { body: UpdateProfileBody }
      },
      async (request) => {
        const current = await resolvePlayer(request);
        const updated = await store.updateDisplayName(current.id, request.body.displayName);
        return { player: updated };
      }
    );

    typedApi.post('/api/player/checkin', async (request) => {
      const player = await resolvePlayer(request);
      const result = await store.claimDailyStreak(player.id);
      const refreshed = await store.getPlayerById(player.id);
      return {
        ...result,
        player: refreshed ?? player,
        streakRewards: STREAK_REWARDS
      };
    });

    // ===================== SHOP & INVENTORY =====================
    typedApi.get('/api/shop/items', async (request) => {
      const player = await resolvePlayer(request);
      return store.getShopCatalog(player.id);
    });

    typedApi.post(
      '/api/shop/purchase',
      {
        schema: { body: ShopActionBody }
      },
      async (request) => {
        const player = await resolvePlayer(request);
        return store.purchaseShopItem(player.id, request.body.itemCode);
      }
    );

    typedApi.post(
      '/api/shop/equip',
      {
        schema: { body: ShopActionBody }
      },
      async (request) => {
        const player = await resolvePlayer(request);
        return store.equipShopItem(player.id, request.body.itemCode);
      }
    );

    // ===================== DAILY QUESTS =====================
    typedApi.get('/api/quests', async (request) => {
      const player = await resolvePlayer(request);
      const quests = await store.getDailyQuests(player.id);
      return { quests, hexaCoins: player.hexaCoins };
    });

    typedApi.post(
      '/api/quests/claim',
      {
        schema: { body: QuestClaimBody }
      },
      async (request) => {
        const player = await resolvePlayer(request);
        return store.claimDailyQuest(player.id, request.body.questCode);
      }
    );

    // ===================== SESSIONS & ANTI-CHEAT =====================
    typedApi.post(
      '/api/sessions/start',
      {
        schema: {
          body: StartSessionBody
        }
      },
      async (request) => {
        const { mode, sides, playerName, deviceId: bodyDeviceId } = request.body;
        const player = await resolvePlayer(request, bodyDeviceId, playerName);

        const sessionId = crypto.randomUUID();
        const seed =
          mode === 'daily'
            ? getDailySeed(undefined, sides)
            : `GYROGON-${sides}G-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const signature = signSessionToken(sessionId, seed, mode, sides);

        await store.createSession({
          id: sessionId,
          userId: player.id,
          mode,
          sides,
          seed,
          signature,
          playerName,
          verified: false,
          finalScore: null,
          startedAt: new Date().toISOString()
        });

        return {
          sessionId,
          userId: player.id,
          mode,
          sides,
          seed,
          signature
        };
      }
    );

    typedApi.post(
      '/api/sessions/submit',
      {
        schema: {
          body: SubmitSessionBody
        }
      },
      async (request, reply) => {
        const { sessionId, signature, claimedScore, moves, playerName } = request.body;
        const session = await store.getSession(sessionId);

        if (!session) {
          return reply.status(404).send({
            verified: false,
            error: 'Session not found'
          });
        }

        if (session.verified) {
          return reply.status(409).send({
            verified: false,
            error: 'Session already submitted'
          });
        }

        const sessionSides: PolygonSides = session.sides ?? DEFAULT_SIDES;

        if (!verifySessionToken(session.id, session.seed, session.mode, signature, sessionSides)) {
          return reply.status(403).send({
            verified: false,
            error: 'Invalid session signature'
          });
        }

        const verification = verifySessionSubmission(session.seed, moves, claimedScore, sessionSides);
        if (!verification.valid) {
          return reply.status(422).send({
            verified: false,
            error: verification.reason ?? 'Anti-cheat replay mismatch',
            simulatedScore: verification.simulatedScore,
            claimedScore: verification.claimedScore
          });
        }

        const moveHash = hashMoveStream(session.seed, moves);
        const finalPlayerName = playerName ?? session.playerName;

        const { player, quests } = await store.finalizeVerifiedSession({
          sessionId: session.id,
          userId: session.userId,
          playerName: finalPlayerName,
          mode: session.mode,
          sides: sessionSides,
          score: verification.simulatedScore,
          maxCombo: verification.maxCombo,
          blocksCleared: verification.blocksCleared,
          coinsEarned: verification.coinsEarned,
          moveHash
        });

        await leaderboard.recordScore({
          mode: session.mode,
          sides: sessionSides,
          memberId: player.id,
          playerName: finalPlayerName,
          score: verification.simulatedScore,
          maxCombo: verification.maxCombo,
          blocksCleared: verification.blocksCleared
        });

        const boardName: LeaderboardBoard = session.mode === 'daily' ? 'daily' : 'classic';
        const boardSnap = await leaderboard.getBoard(boardName, 5, player.id, undefined, sessionSides);

        return {
          verified: true,
          sessionId: session.id,
          mode: session.mode,
          sides: sessionSides,
          score: verification.simulatedScore,
          maxCombo: verification.maxCombo,
          blocksCleared: verification.blocksCleared,
          coinsEarned: verification.coinsEarned,
          moveHash,
          rank: boardSnap.me?.rank ?? null,
          player,
          quests
        };
      }
    );

    // ===================== REDIS ZSET LEADERBOARDS =====================
    const handleLeaderboard = async (
      board: LeaderboardBoard,
      limit: number,
      sides: PolygonSides,
      request: FastifyRequest,
      queryDeviceId?: string
    ) => {
      const hasIdentity =
        Boolean(extractBearerToken(request)) ||
        typeof request.headers['x-device-id'] === 'string' ||
        (typeof queryDeviceId === 'string' && queryDeviceId.length >= 3);

      let memberId: string | undefined;
      if (hasIdentity) {
        const player = await resolvePlayer(request, queryDeviceId);
        memberId = player.id;
      }

      const snapshot = await leaderboard.getBoard(board, limit, memberId, undefined, sides);
      return {
        mode: board,
        ...snapshot
      };
    };

    typedApi.get(
      '/api/leaderboard',
      {
        schema: { querystring: LeaderboardQuery }
      },
      async (request) => {
        const board: LeaderboardBoard = request.query.mode ?? 'classic';
        return handleLeaderboard(
          board,
          request.query.limit,
          request.query.sides,
          request,
          request.query.deviceId
        );
      }
    );

    typedApi.get(
      '/api/leaderboard/:board',
      {
        schema: {
          params: LeaderboardParams,
          querystring: LeaderboardQuery
        }
      },
      async (request) => {
        return handleLeaderboard(
          request.params.board,
          request.query.limit,
          request.query.sides,
          request,
          request.query.deviceId
        );
      }
    );
  });

  return app;
}
