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
  classifyReferrer,
  extractRequestGeoAndVisitor,
  isBotUserAgent,
  parseUserAgent
} from './services/analytics.js';
import {
  hashMoveStream,
  signSessionToken,
  verifySessionSubmission,
  verifySessionToken
} from './services/antiCheat.js';
import { issueTokenPair, hashPassword, verifyJwtToken, verifyPassword } from './services/auth.js';
import {
  InMemoryLeaderboardEngine,
  LeaderboardBoard,
  LeaderboardEngine
} from './services/leaderboard.js';
import { OAuthVerifier, createProductionOAuthVerifier } from './services/oauth.js';
import { GameStore, InMemoryGameStore, PlayerProfile, StoreError } from './services/store.js';
import { registerAdminRoutes } from './routes/admin.js';

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

const EmailRegisterBody = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(128),
  displayName: z.string().trim().min(1).max(32).optional()
});

const EmailLoginBody = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(128)
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

const AnalyticsVisitBody = z.object({
  visitToken: z.string().trim().min(6).max(64),
  deviceId: z.string().trim().min(3).max(128).optional().nullable(),
  isReturning: z.boolean().default(false),
  landingPath: z.string().trim().max(255).default('/'),
  referrerUrl: z.string().trim().max(500).optional().nullable(),
  utmSource: z.string().trim().max(100).optional().nullable(),
  utmMedium: z.string().trim().max(100).optional().nullable(),
  utmCampaign: z.string().trim().max(120).optional().nullable(),
  timezone: z.string().trim().max(64).optional().nullable(),
  language: z.string().trim().max(32).optional().nullable(),
  appMode: z.enum(['browser', 'pwa', 'native']).default('browser'),
  screenWidth: z.number().int().min(0).max(20000).optional().nullable(),
  screenHeight: z.number().int().min(0).max(20000).optional().nullable(),
  viewportWidth: z.number().int().min(0).max(20000).optional().nullable(),
  viewportHeight: z.number().int().min(0).max(20000).optional().nullable(),
  connectionType: z.string().trim().max(24).optional().nullable()
});

const AnalyticsHeartbeatBody = z.object({
  visitToken: z.string().trim().min(6).max(64),
  deviceId: z.string().trim().min(3).max(128).optional().nullable(),
  siteDurationSec: z.number().int().min(0).max(864000).default(0),
  playDurationSec: z.number().int().min(0).max(864000).default(0),
  gamesStarted: z.number().int().min(0).max(10000).default(0),
  gamesCompleted: z.number().int().min(0).max(10000).default(0),
  bestScore: z.number().int().min(0).max(100_000_000).default(0),
  isPlayingNow: z.boolean().default(false),
  lastMode: z.enum(['classic', 'daily']).optional().nullable(),
  lastSides: SidesSchema.optional().nullable(),
  lastLayout: z.enum(['polygon', 'bloom', 'morph']).optional().nullable()
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

function extractDeviceIdOrNull(request: FastifyRequest, explicit?: string | null): string | null {
  const headerVal = request.headers['x-device-id'];
  if (typeof headerVal === 'string' && headerVal.trim().length >= 3) {
    return headerVal.trim().slice(0, 128);
  }
  if (explicit && explicit.trim().length >= 3) {
    return explicit.trim().slice(0, 128);
  }
  return null;
}

function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function tryExtractAuthenticatedUserId(request: FastifyRequest): string | null {
  const bearer = extractBearerToken(request);
  if (!bearer) return null;
  const payload = verifyJwtToken(bearer, 'access');
  return payload?.sub ?? null;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const store = options.store ?? new InMemoryGameStore();
  const leaderboard = options.leaderboard ?? new InMemoryLeaderboardEngine(true);
  const oauthVerifier = options.oauthVerifier ?? createProductionOAuthVerifier();
  const adMobKeyProvider = options.adMobKeyProvider ?? createGoogleAdMobKeyProvider();

  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof StoreError) {
      return reply.status(err.statusCode).send({
        error: err.message,
        code: err.code,
        ...(err.details ?? {})
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

  function assertPlayerNotBanned(player: PlayerProfile): void {
    if (!player.banInfo?.isBanned) return;
    const untilText = player.banInfo.isPermanent
      ? 'süresiz'
      : player.banInfo.bannedUntil
        ? `${new Date(player.banInfo.bannedUntil).toLocaleString('tr-TR')} tarihine kadar`
        : 'süreli';
    const reasonText = player.banInfo.banReason ? ` Sebep: ${player.banInfo.banReason}` : '';
    throw new StoreError(
      403,
      'ACCOUNT_BANNED',
      `Hesabın ${untilText} yasaklandı.${reasonText}`,
      { banInfo: player.banInfo }
    );
  }

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
    registerAdminRoutes(api, { store, leaderboard });

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

    // ===================== FIRST-PARTY ANALYTICS =====================
    typedApi.post(
      '/api/analytics/visit',
      {
        schema: { body: AnalyticsVisitBody }
      },
      async (request) => {
        const ua = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '';
        if (isBotUserAgent(ua)) {
          return { ok: true, ignored: true };
        }
        const userId = tryExtractAuthenticatedUserId(request);
        const deviceId = extractDeviceIdOrNull(request, request.body.deviceId);
        const uaInfo = parseUserAgent(ua);
        const refInfo = classifyReferrer(
          request.body.referrerUrl,
          request.body.utmSource,
          request.body.utmMedium
        );
        const geo = extractRequestGeoAndVisitor(
          request.headers,
          request.ip,
          request.body.timezone
        );

        await store.recordSiteVisit({
          visitToken: request.body.visitToken,
          userId,
          deviceId,
          visitorHash: geo.visitorHash,
          isReturning: request.body.isReturning,
          landingPath: request.body.landingPath || '/',
          referrerUrl: refInfo.cleanReferrerUrl,
          referrerHost: refInfo.referrerHost,
          sourceCategory: refInfo.sourceCategory,
          utmSource: request.body.utmSource?.trim() || null,
          utmMedium: request.body.utmMedium?.trim() || null,
          utmCampaign: request.body.utmCampaign?.trim() || null,
          countryCode: geo.countryCode,
          region: geo.region,
          city: geo.city,
          continent: geo.continent,
          timezone: geo.timezone,
          language: request.body.language?.trim() || null,
          deviceType: uaInfo.deviceType,
          osName: uaInfo.osName,
          osVersion: uaInfo.osVersion,
          browserName: uaInfo.browserName,
          browserVersion: uaInfo.browserVersion,
          appMode: request.body.appMode,
          screenWidth: request.body.screenWidth ?? null,
          screenHeight: request.body.screenHeight ?? null,
          viewportWidth: request.body.viewportWidth ?? null,
          viewportHeight: request.body.viewportHeight ?? null,
          connectionType: request.body.connectionType?.trim() || null
        });

        return { ok: true };
      }
    );

    typedApi.post(
      '/api/analytics/heartbeat',
      {
        schema: { body: AnalyticsHeartbeatBody }
      },
      async (request) => {
        const ua = typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '';
        if (isBotUserAgent(ua)) {
          return { ok: true, ignored: true };
        }
        const userId = tryExtractAuthenticatedUserId(request);
        const deviceId = extractDeviceIdOrNull(request, request.body.deviceId);

        await store.recordSiteHeartbeat({
          visitToken: request.body.visitToken,
          userId,
          deviceId,
          siteDurationSec: request.body.siteDurationSec,
          playDurationSec: request.body.playDurationSec,
          gamesStarted: request.body.gamesStarted,
          gamesCompleted: request.body.gamesCompleted,
          bestScore: request.body.bestScore,
          isPlayingNow: request.body.isPlayingNow,
          lastMode: request.body.lastMode ?? null,
          lastSides: request.body.lastSides ?? null,
          lastLayout: request.body.lastLayout ?? null
        });

        return { ok: true };
      }
    );

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

    typedApi.post(
      '/api/auth/email/register',
      {
        schema: { body: EmailRegisterBody }
      },
      async (request) => {
        let currentPlayer: PlayerProfile | undefined;
        const bearer = extractBearerToken(request);
        if (bearer) {
          const payload = verifyJwtToken(bearer, 'access');
          if (payload) {
            currentPlayer = await store.getPlayerById(payload.sub);
          }
        }
        if (!currentPlayer) {
          const deviceId = extractDeviceId(request);
          currentPlayer = await store.getOrCreatePlayer(deviceId, request.body.displayName);
        }

        const passwordHash = hashPassword(request.body.password);
        const player = await store.registerEmailAccount(
          currentPlayer.id,
          request.body.email,
          passwordHash,
          request.body.displayName
        );
        const tokens = issueTokenPair(player.id, player.guestDeviceId);
        return {
          registered: true,
          ...tokens,
          player
        };
      }
    );

    typedApi.post(
      '/api/auth/email/login',
      {
        schema: { body: EmailLoginBody }
      },
      async (request) => {
        let currentUserId: string | undefined;
        const bearer = extractBearerToken(request);
        if (bearer) {
          const payload = verifyJwtToken(bearer, 'access');
          if (payload) {
            currentUserId = payload.sub;
          }
        }
        if (!currentUserId) {
          const headerVal = request.headers['x-device-id'];
          if (typeof headerVal === 'string' && headerVal.trim().length >= 3) {
            const devPlayer = await store.getOrCreatePlayer(headerVal.trim().slice(0, 128));
            currentUserId = devPlayer.id;
          }
        }

        const { player, mergedFromUserId } = await store.loginEmailAccount(
          currentUserId,
          request.body.email,
          request.body.password,
          verifyPassword
        );

        assertPlayerNotBanned(player);

        if (mergedFromUserId) {
          await leaderboard.removeMember(mergedFromUserId);
        }

        const tokens = issueTokenPair(player.id, player.guestDeviceId);
        return {
          loggedIn: true,
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

    // ===================== PLAYER PROFILE, STATS & STREAK =====================
    typedApi.get('/api/player/profile', async (request) => {
      const player = await resolvePlayer(request);
      const [quests, stats] = await Promise.all([
        store.getDailyQuests(player.id),
        store.getPlayerStats(player.id)
      ]);
      return {
        player,
        quests,
        streakRewards: STREAK_REWARDS,
        stats
      };
    });

    typedApi.get('/api/player/stats', async (request) => {
      const player = await resolvePlayer(request);
      const stats = await store.getPlayerStats(player.id);
      return { stats };
    });

    typedApi.patch(
      '/api/player/profile',
      {
        schema: { body: UpdateProfileBody }
      },
      async (request) => {
        const current = await resolvePlayer(request);
        assertPlayerNotBanned(current);
        const updated = await store.updateDisplayName(current.id, request.body.displayName);
        return { player: updated };
      }
    );

    typedApi.post('/api/player/checkin', async (request) => {
      const player = await resolvePlayer(request);
      assertPlayerNotBanned(player);
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
        assertPlayerNotBanned(player);
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
        assertPlayerNotBanned(player);
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
        assertPlayerNotBanned(player);
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
        assertPlayerNotBanned(player);

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

        const sessionOwner = await store.getPlayerById(session.userId);
        if (sessionOwner) {
          assertPlayerNotBanned(sessionOwner);
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
