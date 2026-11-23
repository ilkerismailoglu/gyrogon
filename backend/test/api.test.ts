import crypto from 'node:crypto';
import { GyrogonSimulator } from '@gyrogon/game-core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryGameStore } from '../src/services/store.js';

describe('@gyrogon/backend API (Faz 1 + Faz 3)', () => {
  it('returns health (with store & leaderboard engines) and daily seed', async () => {
    const app = buildApp();

    const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json()).toMatchObject({
      ok: true,
      service: 'gyrogon-backend',
      store: 'memory',
      leaderboard: 'memory'
    });

    const dailyRes = await app.inject({ method: 'GET', url: '/api/daily' });
    expect(dailyRes.statusCode).toBe(200);
    expect(dailyRes.json().seed).toMatch(/^GYROGON-DAILY-/);
  });

  it('verifies valid replay, rejects tampered score, and updates classic + weekly ZSET leaderboards with player rank', async () => {
    const app = buildApp();
    const headers = { 'x-device-id': 'dev-player-alpha' };

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/start',
      headers,
      payload: { mode: 'classic', playerName: 'Ilker' }
    });
    expect(startRes.statusCode).toBe(200);
    const { sessionId, seed, signature, userId } = startRes.json() as {
      sessionId: string;
      userId: string;
      seed: string;
      signature: string;
    };

    const sim = new GyrogonSimulator(seed);
    let guard = 0;
    while (sim.status !== 'GAMEOVER' && guard < 60 * 120) {
      if (sim.tick % 40 === 5) sim.applyMove('ROTATE_LEFT');
      sim.stepTick();
      guard += 1;
    }

    // Tampered score must fail with 422
    const badSubmit = await app.inject({
      method: 'POST',
      url: '/api/sessions/submit',
      headers,
      payload: {
        sessionId,
        signature,
        claimedScore: sim.score + 9999,
        moves: sim.recordedMoves
      }
    });
    expect(badSubmit.statusCode).toBe(422);
    expect(badSubmit.json().verified).toBe(false);

    // Valid submission succeeds and updates player coins + leaderboards
    const goodSubmit = await app.inject({
      method: 'POST',
      url: '/api/sessions/submit',
      headers,
      payload: {
        sessionId,
        signature,
        claimedScore: sim.score,
        moves: sim.recordedMoves
      }
    });
    expect(goodSubmit.statusCode).toBe(200);
    const submitBody = goodSubmit.json();
    expect(submitBody.verified).toBe(true);
    expect(submitBody.score).toBe(sim.score);
    expect(submitBody.rank).toBeTypeOf('number');
    expect(submitBody.player.hexaCoins).toBe(100 + submitBody.coinsEarned);

    // Classic & weekly leaderboards should include player & return "me" rank + around neighbors
    for (const board of ['classic', 'weekly'] as const) {
      const lbRes = await app.inject({
        method: 'GET',
        url: `/api/leaderboard/${board}?limit=10`,
        headers
      });
      expect(lbRes.statusCode).toBe(200);
      const lb = lbRes.json();
      expect(lb.board).toBe(board);
      expect(lb.me).toBeDefined();
      expect(lb.me.entry.memberId).toBe(userId);
      expect(lb.me.around.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles shop catalog, purchase validation, insufficient coins, and equip authorization', async () => {
    const app = buildApp();
    const headers = { 'x-device-id': 'dev-shopper-01' };

    // New player starts with 100 coins and cyberpunk (Theme 1) equipped by default
    const shopRes = await app.inject({ method: 'GET', url: '/api/shop/items', headers });
    expect(shopRes.statusCode).toBe(200);
    const shop = shopRes.json();
    expect(shop.hexaCoins).toBe(100);
    expect(shop.equippedTheme).toBe('cyberpunk');
    expect(shop.items.length).toBe(5);

    // Equip unowned theme -> 403
    const badEquip = await app.inject({
      method: 'POST',
      url: '/api/shop/equip',
      headers,
      payload: { itemCode: 'synthwave' }
    });
    expect(badEquip.statusCode).toBe(403);

    // Buy expensive theme (matrix = 150 > 100) -> 400
    const tooExpensive = await app.inject({
      method: 'POST',
      url: '/api/shop/purchase',
      headers,
      payload: { itemCode: 'matrix' }
    });
    expect(tooExpensive.statusCode).toBe(400);

    // Buy synthwave (80 <= 100) -> 200, balance becomes 20 and auto-equipped
    const buyRes = await app.inject({
      method: 'POST',
      url: '/api/shop/purchase',
      headers,
      payload: { itemCode: 'synthwave' }
    });
    expect(buyRes.statusCode).toBe(200);
    expect(buyRes.json()).toMatchObject({
      hexaCoins: 20,
      equippedTheme: 'synthwave'
    });

    // Re-buying already owned item -> 409
    const dupBuy = await app.inject({
      method: 'POST',
      url: '/api/shop/purchase',
      headers,
      payload: { itemCode: 'synthwave' }
    });
    expect(dupBuy.statusCode).toBe(409);

    // Switch back to classic (Theme 2) -> 200
    const equipOk = await app.inject({
      method: 'POST',
      url: '/api/shop/equip',
      headers,
      payload: { itemCode: 'classic' }
    });
    expect(equipOk.statusCode).toBe(200);
    expect(equipOk.json().equippedTheme).toBe('classic');
  });

  it('tracks 7-day login streak rewards and daily quest claiming accurately', async () => {
    const store = new InMemoryGameStore();
    const app = buildApp({ store });
    const headers = { 'x-device-id': 'dev-streak-user' };

    // Day 1 check-in via HTTP
    const checkin1 = await app.inject({ method: 'POST', url: '/api/player/checkin', headers });
    expect(checkin1.statusCode).toBe(200);
    const body1 = checkin1.json();
    expect(body1.claimed).toBe(true);
    expect(body1.streakCount).toBe(1);
    expect(body1.rewardCoins).toBe(25);
    expect(body1.hexaCoins).toBe(125);

    // Same-day check-in is idempotent
    const checkinDup = await app.inject({ method: 'POST', url: '/api/player/checkin', headers });
    expect(checkinDup.statusCode).toBe(200);
    expect(checkinDup.json().alreadyClaimed).toBe(true);
    expect(checkinDup.json().rewardCoins).toBe(0);

    // Consecutive 7-day streak progression directly on store
    const player = await store.getOrCreatePlayer('dev-streak-7day', 'Streaker', '2026-11-10');
    const rewards: number[] = [];
    for (let day = 10; day <= 16; day++) {
      const r = await store.claimDailyStreak(player.id, `2026-11-${day}`);
      rewards.push(r.rewardCoins);
    }
    expect(rewards).toEqual([25, 40, 60, 80, 100, 125, 200]);

    // Incomplete quest cannot be claimed (400)
    const badClaim = await app.inject({
      method: 'POST',
      url: '/api/quests/claim',
      headers,
      payload: { questCode: 'q-blocks' }
    });
    expect(badClaim.statusCode).toBe(400);

    // Simulate a finalized high-score session to complete quests and claim q-score
    const p = await store.getOrCreatePlayer('dev-streak-user');
    const sessId = 'sess-quest-test';
    await store.createSession({
      id: sessId,
      userId: p.id,
      mode: 'classic',
      seed: 'seed-q',
      signature: 'sig',
      playerName: 'GyroPilot',
      verified: false,
      finalScore: null,
      startedAt: new Date().toISOString()
    });
    await store.finalizeVerifiedSession({
      sessionId: sessId,
      userId: p.id,
      playerName: 'GyroPilot',
      mode: 'classic',
      score: 1500,
      maxCombo: 5,
      blocksCleared: 35,
      coinsEarned: 15,
      moveHash: 'hash-q'
    });

    const claimOk = await app.inject({
      method: 'POST',
      url: '/api/quests/claim',
      headers,
      payload: { questCode: 'q-score' }
    });
    expect(claimOk.statusCode).toBe(200);
    expect(claimOk.json().rewardCoins).toBe(75);
    expect(claimOk.json().quest.claimed).toBe(true);

    // Double claim rejected with 409
    const claimAgain = await app.inject({
      method: 'POST',
      url: '/api/quests/claim',
      headers,
      payload: { questCode: 'q-score' }
    });
    expect(claimAgain.statusCode).toBe(409);
  });

  it('enforces API rate limiting', async () => {
    const app = buildApp({ rateLimitMax: 2 });
    const r1 = await app.inject({ method: 'GET', url: '/api/health' });
    const r2 = await app.inject({ method: 'GET', url: '/api/health' });
    const r3 = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r3.statusCode).toBe(429);
  });

  it('supports Guest JWT auth, token refresh, Apple/Google Account Linking + Account Merge, and GDPR/App Store deletion', async () => {
    const app = buildApp();

    // 1. Guest sign-in -> issues access + refresh JWTs
    const guest1 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'ios-device-001', displayName: 'IlkerIOS' }
    });
    expect(guest1.statusCode).toBe(200);
    const { accessToken: token1, refreshToken: refresh1, player: p1 } = guest1.json();
    expect(token1).toBeTypeOf('string');
    expect(p1.hexaCoins).toBe(100);

    // Refresh token works
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: refresh1 }
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().accessToken).toBeTypeOf('string');

    // 2. Link Apple account on device 1
    const link1 = await app.inject({
      method: 'POST',
      url: '/api/auth/link/apple',
      headers: { authorization: `Bearer ${token1}` },
      payload: { token: 'dev:apple-sub-777:IlkerApple' }
    });
    expect(link1.statusCode).toBe(200);
    expect(link1.json().linked).toBe(true);
    expect(link1.json().merged).toBe(false);
    expect(link1.json().player.linkedProviders.apple).toBe(true);

    // 3. New guest on device 2 earns checkin bonus (+25 => 125 coins) then links same Apple account -> MERGE!
    const guest2 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'android-device-002', displayName: 'GuestAndroid' }
    });
    const token2 = guest2.json().accessToken as string;
    await app.inject({
      method: 'POST',
      url: '/api/player/checkin',
      headers: { authorization: `Bearer ${token2}` }
    });

    const mergeRes = await app.inject({
      method: 'POST',
      url: '/api/auth/link/apple',
      headers: { authorization: `Bearer ${token2}` },
      payload: { token: 'dev:apple-sub-777:IlkerApple' }
    });
    expect(mergeRes.statusCode).toBe(200);
    expect(mergeRes.json().merged).toBe(true);
    // 100 (device 1) + 125 (device 2) = 225 HexaCoins preserved!
    expect(mergeRes.json().player.hexaCoins).toBe(225);
    const mergedToken = mergeRes.json().accessToken as string;

    // 4. Link Facebook & test Facebook Data Deletion Callback
    const fbLink = await app.inject({
      method: 'POST',
      url: '/api/auth/link/facebook',
      headers: { authorization: `Bearer ${mergedToken}` },
      payload: { token: 'dev:fb-user-999:IlkerFB' }
    });
    expect(fbLink.statusCode).toBe(200);
    expect(fbLink.json().player.linkedProviders.facebook).toBe(true);

    const payloadB64 = Buffer.from(JSON.stringify({ user_id: 'fb-user-999' }))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const sigB64 = crypto
      .createHmac('sha256', 'gyrogon-dev-fb-secret')
      .update(payloadB64)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const fbDel = await app.inject({
      method: 'POST',
      url: '/api/auth/facebook/data-deletion',
      payload: { signed_request: `${sigB64}.${payloadB64}` }
    });
    expect(fbDel.statusCode).toBe(200);
    expect(fbDel.json().deleted).toBe(true);
    expect(fbDel.json().confirmation_code).toMatch(/^HEXDEL-/);

    // 5. Test direct App Store 4.8 DELETE /api/users/me
    const guest3 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'delete-me-device' }
    });
    const delToken = guest3.json().accessToken as string;
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${delToken}` }
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().deleted).toBe(true);
  });

  it('verifies Google AdMob SSV ECDSA-SHA256 callback and prevents duplicate rewards (idempotency)', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1'
    });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const app = buildApp({
      adMobKeyProvider: {
        async getPublicKeyPem(keyId: string) {
          return keyId === '3335741209' ? publicKeyPem : null;
        }
      }
    });

    const guest = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'admob-player-device' }
    });
    const userId = guest.json().player.id as string;

    const baseQuery = `ad_network=5450213213286189855&ad_unit=12345&reward_amount=75&reward_item=hexa_coins&timestamp=1763590000&transaction_id=txn_ecdsa_001&user_id=${userId}`;
    const signer = crypto.createSign('SHA256');
    signer.update(baseQuery, 'utf8');
    signer.end();
    const sigB64Url = signer
      .sign(privateKey)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const fullUrl = `/api/ads/ssv?${baseQuery}&signature=${sigB64Url}&key_id=3335741209`;

    // Valid ECDSA SSV callback grants +75 HexaCoins (100 -> 175)
    const okRes = await app.inject({ method: 'GET', url: fullUrl });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json()).toMatchObject({
      verified: true,
      granted: true,
      duplicate: false,
      hexaCoins: 175
    });

    // Replaying exact same transaction_id is idempotent (no double reward)
    const dupRes = await app.inject({ method: 'GET', url: fullUrl });
    expect(dupRes.statusCode).toBe(200);
    expect(dupRes.json()).toMatchObject({
      verified: true,
      granted: false,
      duplicate: true,
      hexaCoins: 175
    });

    // Tampered reward_amount fails ECDSA check with 400
    const tamperedUrl = fullUrl.replace('reward_amount=75', 'reward_amount=99999');
    const badRes = await app.inject({ method: 'GET', url: tamperedUrl });
    expect(badRes.statusCode).toBe(400);
    expect(badRes.json().verified).toBe(false);
  });

  it('supports isolated sessions, replay verification, and leaderboards per polygon side count (e.g. 3-gon and 7-gon)', async () => {
    const app = buildApp();
    const headers = { 'x-device-id': 'poly-tester-01' };

    for (const sides of [3, 7] as const) {
      const startRes = await app.inject({
        method: 'POST',
        url: '/api/sessions/start',
        headers,
        payload: { mode: 'classic', sides, playerName: `Poly${sides}` }
      });
      expect(startRes.statusCode).toBe(200);
      const { sessionId, seed, signature } = startRes.json();
      expect(startRes.json().sides).toBe(sides);

      const sim = new GyrogonSimulator(seed, sides);
      let guard = 0;
      while (sim.status !== 'GAMEOVER' && guard < 60 * 120) {
        if (sim.tick % 45 === 10) sim.applyMove('ROTATE_RIGHT');
        sim.stepTick();
        guard += 1;
      }

      const submitRes = await app.inject({
        method: 'POST',
        url: '/api/sessions/submit',
        headers,
        payload: {
          sessionId,
          signature,
          claimedScore: sim.score,
          moves: sim.recordedMoves
        }
      });
      expect(submitRes.statusCode).toBe(200);
      expect(submitRes.json().verified).toBe(true);
      expect(submitRes.json().sides).toBe(sides);

      const lbRes = await app.inject({
        method: 'GET',
        url: `/api/leaderboard/classic?sides=${sides}&limit=10`,
        headers
      });
      expect(lbRes.statusCode).toBe(200);
      expect(lbRes.json().sides).toBe(sides);
      expect(lbRes.json().entries.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('supports email registration, duplicate email rejection, password verification, and guest account merge on login', async () => {
    const app = buildApp();

    // 1. Guest on device 1 registers with email + password
    const guest1 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'web-email-dev-1', displayName: 'WebPilot' }
    });
    expect(guest1.statusCode).toBe(200);
    const token1 = guest1.json().accessToken as string;

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      headers: { authorization: `Bearer ${token1}` },
      payload: {
        email: 'Pilot@Gyrogon.com',
        password: 'supersecret123',
        displayName: 'YeniPilot'
      }
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().registered).toBe(true);
    expect(regRes.json().player.email).toBe('pilot@gyrogon.com');
    expect(regRes.json().player.displayName).toBe('YeniPilot');
    expect(regRes.json().player.linkedProviders.email).toBe(true);

    // 2. Duplicate registration with same email on another guest fails with 409
    const guest2 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'web-email-dev-2', displayName: 'SecondDevice' }
    });
    const token2 = guest2.json().accessToken as string;

    const dupReg = await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      headers: { authorization: `Bearer ${token2}` },
      payload: {
        email: 'pilot@gyrogon.com',
        password: 'anotherpassword'
      }
    });
    expect(dupReg.statusCode).toBe(409);

    // 3. Wrong password login fails with 401
    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/email/login',
      headers: { authorization: `Bearer ${token2}` },
      payload: {
        email: 'pilot@gyrogon.com',
        password: 'wrongpassword'
      }
    });
    expect(badLogin.statusCode).toBe(401);

    // 4. Guest on device 2 earns 25 check-in coins (100 -> 125) and logs in -> merges +25 coins (100 + 25 = 125)
    await app.inject({
      method: 'POST',
      url: '/api/player/checkin',
      headers: { authorization: `Bearer ${token2}` }
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/email/login',
      headers: { authorization: `Bearer ${token2}` },
      payload: {
        email: 'PILOT@gyrogon.com',
        password: 'supersecret123'
      }
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().loggedIn).toBe(true);
    expect(loginRes.json().merged).toBe(true);
    expect(loginRes.json().player.email).toBe('pilot@gyrogon.com');
    expect(loginRes.json().player.hexaCoins).toBe(125);
  });

  it('recovers registration with x-device-id when Bearer access token is invalid/stale while keeping strict 401 on protected routes', async () => {
    const app = buildApp();
    const deviceHeaders = { 'x-device-id': 'web-stale-token-dev' };

    // 1. Guest earns 25 check-in coins (100 -> 125)
    const checkinRes = await app.inject({
      method: 'POST',
      url: '/api/player/checkin',
      headers: deviceHeaders
    });
    expect(checkinRes.statusCode).toBe(200);
    expect(checkinRes.json().hexaCoins).toBe(125);

    // 2. Protected route with invalid/stale Bearer token strictly returns 401 INVALID_TOKEN
    const staleProfileRes = await app.inject({
      method: 'GET',
      url: '/api/player/profile',
      headers: {
        ...deviceHeaders,
        authorization: 'Bearer invalid.stale.token'
      }
    });
    expect(staleProfileRes.statusCode).toBe(401);
    expect(staleProfileRes.json().code).toBe('INVALID_TOKEN');

    // 3. Registration with invalid/stale Bearer token falls back to x-device-id, preserves coins, and returns fresh tokens
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      headers: {
        ...deviceHeaders,
        authorization: 'Bearer invalid.stale.token'
      },
      payload: {
        email: 'stale.recovery@gyrogon.com',
        password: 'supersecret123',
        displayName: 'KurtarilanPilot'
      }
    });
    expect(regRes.statusCode).toBe(200);
    const regBody = regRes.json();
    expect(regBody.registered).toBe(true);
    expect(regBody.player.hexaCoins).toBe(125);
    expect(regBody.player.email).toBe('stale.recovery@gyrogon.com');
    expect(regBody.player.displayName).toBe('KurtarilanPilot');
    expect(regBody.accessToken).toBeTypeOf('string');

    // 4. Returned fresh accessToken succeeds on protected route
    const freshProfileRes = await app.inject({
      method: 'GET',
      url: '/api/player/profile',
      headers: {
        ...deviceHeaders,
        authorization: `Bearer ${regBody.accessToken}`
      }
    });
    expect(freshProfileRes.statusCode).toBe(200);
    expect(freshProfileRes.json().player.hexaCoins).toBe(125);
    expect(freshProfileRes.json().player.email).toBe('stale.recovery@gyrogon.com');
  });

  it('aggregates comprehensive player statistics across sessions, polygon sides, and claimed quests', async () => {
    const app = buildApp();
    const headers = { 'x-device-id': 'stats-player-dev-1' };

    // 1. Fresh player starts with zeroed stats and all 6 supported polygons
    const initialStatsRes = await app.inject({
      method: 'GET',
      url: '/api/player/stats',
      headers
    });
    expect(initialStatsRes.statusCode).toBe(200);
    const initialStats = initialStatsRes.json().stats;
    expect(initialStats).toMatchObject({
      totalGames: 0,
      classicGames: 0,
      dailyGames: 0,
      totalBlocksCleared: 0,
      totalScore: 0,
      averageScore: 0,
      bestScore: 0,
      bestCombo: 0,
      totalCoinsEarned: 0,
      questsCompleted: 0,
      favoriteSides: null,
      recentGames: []
    });
    expect(initialStats.bySides).toHaveLength(6);

    // 2. Play & submit two verified sessions (classic 6-gon, then daily 4-gon)
    const runs = [
      { mode: 'classic' as const, sides: 6 as const },
      { mode: 'daily' as const, sides: 4 as const }
    ];
    let expectedBlocks = 0;
    let expectedScore = 0;
    let expectedCoins = 0;
    let expectedBestCombo = 0;
    let expectedClassicBest = 0;
    let expectedDailyBest = 0;

    for (const run of runs) {
      const startRes = await app.inject({
        method: 'POST',
        url: '/api/sessions/start',
        headers,
        payload: { mode: run.mode, sides: run.sides, playerName: 'StatPilot' }
      });
      expect(startRes.statusCode).toBe(200);
      const { sessionId, seed, signature } = startRes.json() as {
        sessionId: string;
        seed: string;
        signature: string;
      };

      const sim = new GyrogonSimulator(seed, run.sides);
      let guard = 0;
      while (sim.status !== 'GAMEOVER' && guard < 60 * 120) {
        if (sim.tick % 40 === 5) sim.applyMove('ROTATE_LEFT');
        sim.stepTick();
        guard += 1;
      }

      const submitRes = await app.inject({
        method: 'POST',
        url: '/api/sessions/submit',
        headers,
        payload: {
          sessionId,
          signature,
          claimedScore: sim.score,
          moves: sim.recordedMoves,
          playerName: 'StatPilot'
        }
      });
      expect(submitRes.statusCode).toBe(200);
      const submitData = submitRes.json();

      expectedBlocks += submitData.blocksCleared as number;
      expectedScore += submitData.score as number;
      expectedCoins += submitData.coinsEarned as number;
      expectedBestCombo = Math.max(expectedBestCombo, submitData.maxCombo as number);
      if (run.mode === 'classic') {
        expectedClassicBest = Math.max(expectedClassicBest, submitData.score as number);
      } else {
        expectedDailyBest = Math.max(expectedDailyBest, submitData.score as number);
      }
    }

    // 3. Verify GET /api/player/stats and GET /api/player/profile (.stats)
    const [statsRes, profileRes] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/player/stats', headers }),
      app.inject({ method: 'GET', url: '/api/player/profile', headers })
    ]);
    expect(statsRes.statusCode).toBe(200);
    expect(profileRes.statusCode).toBe(200);

    const stats = statsRes.json().stats;
    expect(profileRes.json().stats).toEqual(stats);
    expect(stats).toMatchObject({
      totalGames: 2,
      classicGames: 1,
      dailyGames: 1,
      totalBlocksCleared: expectedBlocks,
      totalScore: expectedScore,
      averageScore: Math.round(expectedScore / 2),
      bestScore: Math.max(expectedClassicBest, expectedDailyBest),
      bestScoreClassic: expectedClassicBest,
      bestScoreDaily: expectedDailyBest,
      bestCombo: expectedBestCombo,
      totalCoinsEarned: expectedCoins
    });
    expect(stats.recentGames).toHaveLength(2);
    expect(stats.bySides.find((s: { sides: number }) => s.sides === 6)?.games).toBe(1);
    expect(stats.bySides.find((s: { sides: number }) => s.sides === 4)?.games).toBe(1);
  });

  it('enforces admin JWT auth and supports admin overview, player management, edits, score moderation, and user deletion', async () => {
    const app = buildApp();

    // 1. Seed a guest player and a registered player with a verified game
    const guestOnlyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'admin-test-guest', displayName: 'SadeMisafir' }
    });
    expect(guestOnlyRes.statusCode).toBe(200);
    const guestId = guestOnlyRes.json().player.id as string;

    const regGuestRes = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'admin-test-reg', displayName: 'YildizPilot' }
    });
    const playerToken = regGuestRes.json().accessToken as string;
    const regUserId = regGuestRes.json().player.id as string;

    await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: {
        email: 'admin.check@gyrogon.com',
        password: 'supersecret123',
        displayName: 'YildizPilot'
      }
    });

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/start',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: { mode: 'classic', sides: 6, playerName: 'YildizPilot' }
    });
    const { sessionId, seed, signature } = startRes.json() as {
      sessionId: string;
      seed: string;
      signature: string;
    };
    const sim = new GyrogonSimulator(seed, 6);
    let guard = 0;
    while (sim.status !== 'GAMEOVER' && guard < 60 * 120) {
      if (sim.tick % 40 === 5) sim.applyMove('ROTATE_LEFT');
      sim.stepTick();
      guard += 1;
    }
    await app.inject({
      method: 'POST',
      url: '/api/sessions/submit',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: {
        sessionId,
        signature,
        claimedScore: sim.score,
        moves: sim.recordedMoves,
        playerName: 'YildizPilot'
      }
    });

    // 2. Unauthenticated and regular player JWT fail with 401
    const noAuthRes = await app.inject({ method: 'GET', url: '/api/admin/overview' });
    expect(noAuthRes.statusCode).toBe(401);

    const playerJwtRes = await app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: { authorization: `Bearer ${playerToken}` }
    });
    expect(playerJwtRes.statusCode).toBe(401);

    // 3. Wrong password returns 401; valid password returns admin JWT
    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrong-admin-password' }
    });
    expect(badLogin.statusCode).toBe(401);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'gyrogon-admin' }
    });
    expect(loginRes.statusCode).toBe(200);
    const adminToken = loginRes.json().token as string;
    expect(adminToken).toBeTypeOf('string');
    const adminHeaders = { authorization: `Bearer ${adminToken}` };

    // 4. Overview & Player listing filters
    const overviewRes = await app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: adminHeaders
    });
    expect(overviewRes.statusCode).toBe(200);
    const ov = overviewRes.json().overview;
    expect(ov.totalUsers).toBe(2);
    expect(ov.registeredUsers).toBe(1);
    expect(ov.guestUsers).toBe(1);
    expect(ov.totalGames).toBe(1);
    expect(ov.dailyTrend).toHaveLength(14);
    expect(ov.bySides).toHaveLength(6);
    expect(ov.themes).toHaveLength(5);

    const regSearchRes = await app.inject({
      method: 'GET',
      url: '/api/admin/players?accountType=registered&q=admin.check',
      headers: adminHeaders
    });
    expect(regSearchRes.statusCode).toBe(200);
    expect(regSearchRes.json().total).toBe(1);
    expect(regSearchRes.json().items[0].id).toBe(regUserId);

    // 5. Player detail & PATCH mutations (rename, coinsDelta, unlock & equip theme)
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/admin/players/${regUserId}`,
      headers: adminHeaders
    });
    expect(detailRes.statusCode).toBe(200);
    const initialCoins = detailRes.json().player.hexaCoins as number;

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/players/${regUserId}`,
      headers: adminHeaders,
      payload: {
        displayName: 'YoneticiOnayli',
        coinsDelta: 250,
        streakCount: 5,
        unlockThemeCode: 'matrix',
        equippedTheme: 'synthwave'
      }
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().player.displayName).toBe('YoneticiOnayli');
    expect(patchRes.json().player.hexaCoins).toBe(initialCoins + 250);
    expect(patchRes.json().player.streakCount).toBe(5);
    expect(patchRes.json().player.equippedTheme).toBe('synthwave');
    expect(patchRes.json().player.unlockedItems).toContain('matrix');
    expect(patchRes.json().player.unlockedItems).toContain('synthwave');

    // 6. Score list & delete score recalculates highScoreClassic
    const scoresRes = await app.inject({
      method: 'GET',
      url: '/api/admin/scores?mode=classic&sort=score',
      headers: adminHeaders
    });
    expect(scoresRes.statusCode).toBe(200);
    expect(scoresRes.json().total).toBe(1);
    const scoreId = scoresRes.json().items[0].id as string;

    const delScoreRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/scores/${scoreId}`,
      headers: adminHeaders
    });
    expect(delScoreRes.statusCode).toBe(200);
    expect(delScoreRes.json().deleted).toBe(true);

    const afterScoreDelDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/players/${regUserId}`,
      headers: adminHeaders
    });
    expect(afterScoreDelDetail.json().player.highScoreClassic).toBe(0);
    expect(afterScoreDelDetail.json().stats.totalGames).toBe(0);

    // 7. Delete guest player
    const delUserRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/players/${guestId}`,
      headers: adminHeaders
    });
    expect(delUserRes.statusCode).toBe(200);
    expect(delUserRes.json().deleted).toBe(true);
  });

  it('supports temporary and permanent player bans, single/bulk rewards, and database-backed admin password updates', async () => {
    const app = buildApp();

    // Create two players (one guest, one registered)
    const guest1 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'ban-reward-guest-1', displayName: 'BanAdayi' }
    });
    const token1 = guest1.json().accessToken as string;
    const player1Id = guest1.json().player.id as string;

    const guest2 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'ban-reward-reg-2', displayName: 'OdulAdayi' }
    });
    const token2 = guest2.json().accessToken as string;
    const player2Id = guest2.json().player.id as string;
    await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      headers: { authorization: `Bearer ${token2}` },
      payload: { email: 'odul@gyrogon.com', password: 'supersecret123', displayName: 'OdulAdayi' }
    });

    // Admin login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'gyrogon-admin' }
    });
    let adminHeaders = { authorization: `Bearer ${loginRes.json().token as string}` };

    // 1. Temporary ban (24h) blocks gameplay & checkin with 403 ACCOUNT_BANNED
    const tempBanRes = await app.inject({
      method: 'POST',
      url: `/api/admin/players/${player1Id}/ban`,
      headers: adminHeaders,
      payload: { durationHours: 24, reason: 'Kural ihlali testi' }
    });
    expect(tempBanRes.statusCode).toBe(200);
    expect(tempBanRes.json().player.banInfo.isBanned).toBe(true);
    expect(tempBanRes.json().player.banInfo.isPermanent).toBe(false);
    expect(tempBanRes.json().player.banInfo.banReason).toBe('Kural ihlali testi');

    const blockedStart = await app.inject({
      method: 'POST',
      url: '/api/sessions/start',
      headers: { authorization: `Bearer ${token1}` },
      payload: { mode: 'classic', sides: 6 }
    });
    expect(blockedStart.statusCode).toBe(403);
    expect(blockedStart.json().code).toBe('ACCOUNT_BANNED');

    const blockedCheckin = await app.inject({
      method: 'POST',
      url: '/api/player/checkin',
      headers: { authorization: `Bearer ${token1}` }
    });
    expect(blockedCheckin.statusCode).toBe(403);
    expect(blockedCheckin.json().code).toBe('ACCOUNT_BANNED');

    // Profile still returns banInfo so UI can display details
    const bannedProfile = await app.inject({
      method: 'GET',
      url: '/api/player/profile',
      headers: { authorization: `Bearer ${token1}` }
    });
    expect(bannedProfile.statusCode).toBe(200);
    expect(bannedProfile.json().player.banInfo.isBanned).toBe(true);

    // 2. Unban restores gameplay
    const unbanRes = await app.inject({
      method: 'POST',
      url: `/api/admin/players/${player1Id}/unban`,
      headers: adminHeaders
    });
    expect(unbanRes.statusCode).toBe(200);
    expect(unbanRes.json().player.banInfo.isBanned).toBe(false);

    const allowedStart = await app.inject({
      method: 'POST',
      url: '/api/sessions/start',
      headers: { authorization: `Bearer ${token1}` },
      payload: { mode: 'classic', sides: 6 }
    });
    expect(allowedStart.statusCode).toBe(200);

    // 3. Permanent ban & banned player filter
    const permBanRes = await app.inject({
      method: 'POST',
      url: `/api/admin/players/${player1Id}/ban`,
      headers: adminHeaders,
      payload: { permanent: true, reason: 'Kalici engel' }
    });
    expect(permBanRes.statusCode).toBe(200);
    expect(permBanRes.json().player.banInfo.isPermanent).toBe(true);
    expect(permBanRes.json().player.banInfo.bannedUntil).toBeNull();

    const bannedListRes = await app.inject({
      method: 'GET',
      url: '/api/admin/players?accountType=banned',
      headers: adminHeaders
    });
    expect(bannedListRes.statusCode).toBe(200);
    expect(bannedListRes.json().total).toBe(1);
    expect(bannedListRes.json().items[0].id).toBe(player1Id);
    expect(bannedListRes.json().items[0].isPermanentBan).toBe(true);

    // 4. Single & Bulk Reward Granting + Reward Log
    const singleRewardRes = await app.inject({
      method: 'POST',
      url: '/api/admin/rewards/grant',
      headers: adminHeaders,
      payload: {
        scope: 'single',
        userId: player2Id,
        coinsAmount: 300,
        themeCode: 'matrix',
        reason: 'Haftalik etkinlik hediyesi'
      }
    });
    expect(singleRewardRes.statusCode).toBe(200);
    expect(singleRewardRes.json().affectedCount).toBe(1);
    expect(singleRewardRes.json().playerDetail.player.hexaCoins).toBe(400);
    expect(singleRewardRes.json().playerDetail.player.unlockedItems).toContain('matrix');

    const bulkRewardRes = await app.inject({
      method: 'POST',
      url: '/api/admin/rewards/grant',
      headers: adminHeaders,
      payload: {
        scope: 'all',
        coinsAmount: 50,
        reason: 'Sunucu kutlama bonusu'
      }
    });
    expect(bulkRewardRes.statusCode).toBe(200);
    expect(bulkRewardRes.json().affectedCount).toBe(2);

    const rewardsLogRes = await app.inject({
      method: 'GET',
      url: '/api/admin/rewards',
      headers: adminHeaders
    });
    expect(rewardsLogRes.statusCode).toBe(200);
    expect(rewardsLogRes.json().items).toHaveLength(2);

    // 5. Admin password settings & update
    const wrongPwChange = await app.inject({
      method: 'POST',
      url: '/api/admin/settings/password',
      headers: adminHeaders,
      payload: { currentPassword: 'wrong', newPassword: 'NewSuperPassword123' }
    });
    expect(wrongPwChange.statusCode).toBe(401);

    const okPwChange = await app.inject({
      method: 'POST',
      url: '/api/admin/settings/password',
      headers: adminHeaders,
      payload: { currentPassword: 'gyrogon-admin', newPassword: 'NewSuperPassword123' }
    });
    expect(okPwChange.statusCode).toBe(200);
    expect(okPwChange.json().changed).toBe(true);
    expect(okPwChange.json().passwordSource).toBe('database');

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'gyrogon-admin' }
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'NewSuperPassword123' }
    });
    expect(newLogin.statusCode).toBe(200);
    adminHeaders = { authorization: `Bearer ${newLogin.json().token as string}` };

    const settingsRes = await app.inject({
      method: 'GET',
      url: '/api/admin/settings',
      headers: adminHeaders
    });
    expect(settingsRes.statusCode).toBe(200);
    expect(settingsRes.json().passwordSource).toBe('database');
  });

  it('tracks first-party geo, referrer, browser/OS, site & play durations, filters bots, and reports admin analytics', async () => {
    const store = new InMemoryGameStore();
    const app = buildApp({ store });

    // Create guest player first
    const guestRes = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { deviceId: 'dev-analytics-player', displayName: 'TrPilot' }
    });
    expect(guestRes.statusCode).toBe(200);
    const { accessToken, player } = guestRes.json();

    // 1. Track Turkish mobile Safari visit from Instagram UTM link
    const visit1Res = await app.inject({
      method: 'POST',
      url: '/api/analytics/visit',
      headers: {
        authorization: `Bearer ${accessToken as string}`,
        'x-device-id': 'dev-analytics-player',
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        'cf-ipcountry': 'TR',
        'cf-ipcity': 'Istanbul',
        'cf-region': 'Istanbul',
        'cf-ipcontinent': 'EU',
        'cf-timezone': 'Europe/Istanbul',
        'cf-connecting-ip': '88.241.10.1'
      },
      payload: {
        visitToken: 'visit-token-tr-1',
        deviceId: 'dev-analytics-player',
        isReturning: false,
        landingPath: '/',
        referrerUrl: 'https://l.instagram.com/?u=https://gyrogon.com',
        utmSource: 'instagram',
        utmMedium: 'story',
        utmCampaign: 'kasim_lansman',
        language: 'tr-TR',
        appMode: 'browser',
        screenWidth: 390,
        screenHeight: 844,
        connectionType: '4g'
      }
    });
    expect(visit1Res.statusCode).toBe(200);

    // Send heartbeat including absurdly spoofed duration -> clamped cleanly by server cap (60s for brand-new visit)
    const hb1Res = await app.inject({
      method: 'POST',
      url: '/api/analytics/heartbeat',
      headers: { authorization: `Bearer ${accessToken as string}` },
      payload: {
        visitToken: 'visit-token-tr-1',
        siteDurationSec: 55,
        playDurationSec: 40,
        gamesStarted: 2,
        gamesCompleted: 2,
        bestScore: 1450,
        isPlayingNow: true,
        lastMode: 'classic',
        lastSides: 6,
        lastLayout: 'morph'
      }
    });
    expect(hb1Res.statusCode).toBe(200);

    const spoofHb = await app.inject({
      method: 'POST',
      url: '/api/analytics/heartbeat',
      payload: {
        visitToken: 'visit-token-tr-1',
        siteDurationSec: 50000,
        playDurationSec: 50000,
        gamesStarted: 2,
        gamesCompleted: 2,
        bestScore: 1450,
        isPlayingNow: false
      }
    });
    expect(spoofHb.statusCode).toBe(200);

    // 2. Track German desktop Chrome visit from Google search
    const visit2Res = await app.inject({
      method: 'POST',
      url: '/api/analytics/visit',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'cf-ipcountry': 'DE',
        'cf-ipcity': 'Berlin',
        'cf-region': 'Berlin',
        'cf-timezone': 'Europe/Berlin',
        'cf-connecting-ip': '91.12.33.44'
      },
      payload: {
        visitToken: 'visit-token-de-2',
        isReturning: true,
        landingPath: '/',
        referrerUrl: 'https://www.google.com/',
        language: 'de-DE',
        appMode: 'pwa',
        screenWidth: 1920,
        screenHeight: 1080
      }
    });
    expect(visit2Res.statusCode).toBe(200);

    // 3. Crawler bot visit must be ignored cleanly
    const botRes = await app.inject({
      method: 'POST',
      url: '/api/analytics/visit',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      },
      payload: {
        visitToken: 'visit-token-bot',
        landingPath: '/'
      }
    });
    expect(botRes.statusCode).toBe(200);
    expect(botRes.json().ignored).toBe(true);

    // Admin login & analytics report verification
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'gyrogon-admin' }
    });
    const adminHeaders = { authorization: `Bearer ${loginRes.json().token as string}` };

    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics?range=7d',
      headers: adminHeaders
    });
    expect(reportRes.statusCode).toBe(200);
    const report = reportRes.json();

    expect(report.summary.totalVisits).toBe(2);
    expect(report.summary.uniqueVisitors).toBe(2);
    expect(report.summary.newVisitors).toBe(1);
    expect(report.summary.returningVisitors).toBe(1);
    expect(report.summary.liveVisitors).toBe(2);
    expect(report.summary.totalSiteDurationSec).toBeLessThanOrEqual(120);
    expect(report.summary.totalPlayDurationSec).toBeLessThanOrEqual(65);
    expect(report.summary.visitsWithGameplay).toBe(1);
    expect(report.summary.totalGamesStarted).toBe(2);
    expect(report.summary.totalGamesCompleted).toBe(2);

    expect(report.byCountry.map((c: { countryCode: string }) => c.countryCode)).toEqual(
      expect.arrayContaining(['TR', 'DE'])
    );
    expect(report.byCity.map((c: { city: string }) => c.city)).toEqual(
      expect.arrayContaining(['Istanbul', 'Berlin'])
    );
    expect(report.byBrowser.map((b: { name: string }) => b.name)).toEqual(
      expect.arrayContaining(['Safari', 'Chrome'])
    );
    expect(report.byOs.map((o: { name: string }) => o.name)).toEqual(
      expect.arrayContaining(['iOS', 'Windows'])
    );
    expect(report.byUtmCampaign[0]).toMatchObject({
      utmSource: 'instagram',
      utmCampaign: 'kasim_lansman'
    });

    // Country filter works cleanly
    const trOnlyRes = await app.inject({
      method: 'GET',
      url: '/api/admin/analytics?range=7d&country=TR&deviceType=mobile&source=social',
      headers: adminHeaders
    });
    expect(trOnlyRes.statusCode).toBe(200);
    expect(trOnlyRes.json().summary.totalVisits).toBe(1);
    expect(trOnlyRes.json().recentVisits[0].city).toBe('Istanbul');

    // Player detail includes visitSummary
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/admin/players/${player.id}`,
      headers: adminHeaders
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().visitSummary.totalVisits).toBe(1);
    expect(detailRes.json().visitSummary.lastCountryCode).toBe('TR');
    expect(detailRes.json().visitSummary.lastCity).toBe('Istanbul');
    expect(detailRes.json().visitSummary.lastBrowser).toContain('Safari');
  });

  it('prevents ghost user creation on passive reads/bots and assigns unique numbered GyroPilot names', async () => {
    const store = new InMemoryGameStore();
    const app = buildApp({ store });

    // 1. Bot requests to /api/auth/guest are blocked and create 0 users
    const botGuest = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'
      },
      payload: { deviceId: 'dev-bot-should-not-create' }
    });
    expect(botGuest.statusCode).toBe(403);
    expect(botGuest.json().code).toBe('BOT_BLOCKED');

    // 2. Passive reads with unknown deviceId do not create ghost users
    const passiveHeaders = { 'x-device-id': 'dev-passive-visitor-01' };
    const profilePassive = await app.inject({
      method: 'GET',
      url: '/api/player/profile?existingOnly=1',
      headers: passiveHeaders
    });
    expect(profilePassive.statusCode).toBe(200);
    expect(profilePassive.json().exists).toBe(false);
    expect(profilePassive.json().player).toBeNull();

    const statsPassive = await app.inject({
      method: 'GET',
      url: '/api/player/stats?existingOnly=1',
      headers: passiveHeaders
    });
    expect(statsPassive.statusCode).toBe(200);
    expect(statsPassive.json().exists).toBe(false);
    expect(statsPassive.json().stats).toBeNull();

    const lbPassive = await app.inject({
      method: 'GET',
      url: '/api/leaderboard/classic?sides=6&limit=10',
      headers: passiveHeaders
    });
    expect(lbPassive.statusCode).toBe(200);
    expect(lbPassive.json().me).toBeUndefined();

    // Failed login with unknown deviceId also creates 0 users
    const failLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/email/login',
      headers: passiveHeaders,
      payload: { email: 'nonexistent@gyrogon.com', password: 'password123' }
    });
    expect(failLogin.statusCode).toBe(401);

    const overviewAfterPassive = await store.getAdminOverview();
    expect(overviewAfterPassive.totalUsers).toBe(0);

    // 3. New real guests receive unique numbered GyroPilot<N> names (never bare "GyroPilot")
    const g1 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/126.0.0.0' },
      payload: { deviceId: 'dev-real-guest-1' }
    });
    expect(g1.statusCode).toBe(200);
    const name1 = g1.json().player.displayName as string;
    expect(name1).toMatch(/^GyroPilot\d+$/);

    const g2 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/126.0.0.0' },
      payload: { deviceId: 'dev-real-guest-2', displayName: 'GyroPilot' }
    });
    expect(g2.statusCode).toBe(200);
    const name2 = g2.json().player.displayName as string;
    expect(name2).toMatch(/^GyroPilot\d+$/);
    expect(name2).not.toBe(name1);

    // Duplicate numbered name passed explicitly gets disambiguated
    const g3 = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/126.0.0.0' },
      payload: { deviceId: 'dev-real-guest-3', displayName: name1 }
    });
    expect(g3.statusCode).toBe(200);
    const name3 = g3.json().player.displayName as string;
    expect(name3).toMatch(/^GyroPilot\d+$/);
    expect(name3).not.toBe(name1);
  });

  it('merges cross-polygon scores on unified leaderboard while preserving per-polygon filtering and side metadata', async () => {
    const app = buildApp();

    const playAndSubmit = async (deviceId: string, playerName: string, sides: 3 | 7, rotateEvery: number) => {
      const headers = { 'x-device-id': deviceId, 'user-agent': 'Mozilla/5.0 Chrome/126.0.0.0' };
      const startRes = await app.inject({
        method: 'POST',
        url: '/api/sessions/start',
        headers,
        payload: { mode: 'classic', sides, playerName }
      });
      expect(startRes.statusCode).toBe(200);
      const { sessionId, seed, signature, userId } = startRes.json() as {
        sessionId: string;
        seed: string;
        signature: string;
        userId: string;
      };

      const sim = new GyrogonSimulator(seed, sides);
      let guard = 0;
      while (sim.status !== 'GAMEOVER' && guard < 60 * 120) {
        if (guard % rotateEvery === 5) sim.applyMove('ROTATE_LEFT');
        sim.stepTick();
        guard += 1;
      }

      const subRes = await app.inject({
        method: 'POST',
        url: '/api/sessions/submit',
        headers,
        payload: { sessionId, signature, claimedScore: sim.score, moves: sim.recordedMoves }
      });
      expect(subRes.statusCode).toBe(200);
      return { userId, score: sim.score };
    };

    const run3 = await playAndSubmit('dev-uni-player-1', 'UniPilot', 3, 25);
    const run7 = await playAndSubmit('dev-uni-player-1', 'UniPilot', 7, 45);
    const heptaRun = await playAndSubmit('dev-uni-player-2', 'HeptaPilot', 7, 30);

    // Unified leaderboard (no sides filter) merges highest score per player across all polygons
    const unifiedRes = await app.inject({
      method: 'GET',
      url: '/api/leaderboard/classic?limit=30',
      headers: { 'x-device-id': 'dev-uni-player-1' }
    });
    expect(unifiedRes.statusCode).toBe(200);
    const unified = unifiedRes.json();
    expect(unified.sides).toBe('all');

    const uniEntries = (unified.entries as Array<{ memberId: string; score: number; sides?: number; avatarUrl?: string; avatarFrame?: string }>).filter(
      (e) => e.memberId === run3.userId
    );
    expect(uniEntries).toHaveLength(1);
    expect(uniEntries[0]?.score).toBe(Math.max(run3.score, run7.score));
    expect([3, 7]).toContain(uniEntries[0]?.sides);
    if (run3.score !== run7.score) {
      expect(uniEntries[0]?.sides).toBe(run7.score > run3.score ? 7 : 3);
    }
    expect(uniEntries[0]?.avatarUrl).toBe('preset:pilot');
    expect(uniEntries[0]?.avatarFrame).toBe('default');

    const heptaEntry = (unified.entries as Array<{ memberId: string; sides?: number }>).find(
      (e) => e.memberId === heptaRun.userId
    );
    expect(heptaEntry?.sides).toBe(7);

    // Filtered ?sides=3 still isolates 3-gon runs
    const only3Res = await app.inject({
      method: 'GET',
      url: '/api/leaderboard/classic?sides=3&limit=30',
      headers: { 'x-device-id': 'dev-uni-player-1' }
    });
    expect(only3Res.statusCode).toBe(200);
    const only3 = only3Res.json();
    expect(only3.sides).toBe(3);
    const p1Three = (only3.entries as Array<{ memberId: string; score: number; sides?: number }>).find(
      (e) => e.memberId === run3.userId
    );
    expect(p1Three?.score).toBe(run3.score);
    expect((only3.entries as Array<{ memberId: string }>).some((e) => e.memberId === heptaRun.userId)).toBe(false);
  });

  it('supports default avatar/frame, validates preset & custom avatars, blocks locked frames, and hydrates leaderboard entries live', async () => {
    const app = buildApp();
    const headers = { 'x-device-id': 'dev-avatar-test', 'user-agent': 'Mozilla/5.0 Chrome/126.0.0.0' };

    const guestRes = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      headers,
      payload: { deviceId: 'dev-avatar-test' }
    });
    expect(guestRes.statusCode).toBe(200);
    expect(guestRes.json().player.avatarUrl).toBe('preset:pilot');
    expect(guestRes.json().player.avatarFrame).toBe('default');

    // Submit a score so the player appears on the classic leaderboard
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/start',
      headers,
      payload: { mode: 'classic', sides: 6 }
    });
    const { sessionId, seed, signature } = startRes.json() as {
      sessionId: string;
      seed: string;
      signature: string;
    };
    const sim = new GyrogonSimulator(seed, 6);
    let guard = 0;
    while (sim.status !== 'GAMEOVER' && guard < 60 * 120) {
      if (guard % 35 === 4) sim.applyMove('ROTATE_LEFT');
      sim.stepTick();
      guard += 1;
    }
    const subRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/submit',
      headers,
      payload: { sessionId, signature, claimedScore: sim.score, moves: sim.recordedMoves }
    });
    expect(subRes.statusCode).toBe(200);

    // Preset avatar update succeeds
    const presetRes = await app.inject({
      method: 'PATCH',
      url: '/api/player/profile',
      headers,
      payload: { avatarUrl: 'preset:capybara', avatarFrame: 'default' }
    });
    expect(presetRes.statusCode).toBe(200);
    expect(presetRes.json().player.avatarUrl).toBe('preset:capybara');

    // Custom uploaded WebP/PNG data URL succeeds
    const customRes = await app.inject({
      method: 'PATCH',
      url: '/api/player/profile',
      headers,
      payload: {
        avatarUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='
      }
    });
    expect(customRes.statusCode).toBe(200);
    expect(customRes.json().player.avatarUrl).toMatch(/^data:image\/webp;base64,/);

    // Rejects unsafe/invalid or oversized avatar URLs with 400
    for (const badAvatar of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      `data:image/png;base64,${'A'.repeat(130000)}`
    ]) {
      const badRes = await app.inject({
        method: 'PATCH',
        url: '/api/player/profile',
        headers,
        payload: { avatarUrl: badAvatar }
      });
      expect(badRes.statusCode).toBe(400);
    }

    // Rejects locked avatar frame with 403 FRAME_LOCKED
    const lockedRes = await app.inject({
      method: 'PATCH',
      url: '/api/player/profile',
      headers,
      payload: { avatarFrame: 'solar-gold' }
    });
    expect(lockedRes.statusCode).toBe(403);
    expect(lockedRes.json().code).toBe('FRAME_LOCKED');

    // Update to preset:fox and confirm leaderboard hydrates live avatarUrl + avatarFrame
    const foxRes = await app.inject({
      method: 'PATCH',
      url: '/api/player/profile',
      headers,
      payload: { avatarUrl: 'preset:fox' }
    });
    expect(foxRes.statusCode).toBe(200);

    const lbRes = await app.inject({
      method: 'GET',
      url: '/api/leaderboard/classic?limit=30',
      headers
    });
    expect(lbRes.statusCode).toBe(200);
    const lbBody = lbRes.json();
    expect(lbBody.me?.entry?.avatarUrl).toBe('preset:fox');
    expect(lbBody.me?.entry?.avatarFrame).toBe('default');
  });

  it('supports 6-digit password reset flow: hides unknown emails, locks after 5 bad codes, resets password, and invalidates used codes', async () => {
    const sentMails: Array<{ to: string; displayName: string; code: string }> = [];
    const app = buildApp({
      resetCooldownSec: 0,
      mailer: {
        async sendPasswordResetEmail(input) {
          sentMails.push({ to: input.to, displayName: input.displayName, code: input.code });
          return { sent: true, provider: 'resend' };
        }
      }
    });

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/email/register',
      headers: { 'x-device-id': 'dev-reset-test-user', 'user-agent': 'Mozilla/5.0 Chrome/126.0.0.0' },
      payload: {
        email: 'reset-pilot@gyrogon.com',
        password: 'oldPassword123',
        displayName: 'ResetPilot'
      }
    });
    expect(regRes.statusCode).toBe(200);

    // 1. Non-existent email still returns 200 without sending email (anti-enumeration)
    const unknownRes = await app.inject({
      method: 'POST',
      url: '/api/auth/email/forgot-password',
      payload: { email: 'nobody@gyrogon.com', lang: 'tr' }
    });
    expect(unknownRes.statusCode).toBe(200);
    expect(unknownRes.json().ok).toBe(true);
    expect(sentMails).toHaveLength(0);

    // 2. Registered email triggers 6-digit code delivery
    const forgot1 = await app.inject({
      method: 'POST',
      url: '/api/auth/email/forgot-password',
      payload: { email: 'Reset-Pilot@gyrogon.com', lang: 'tr' }
    });
    expect(forgot1.statusCode).toBe(200);
    expect(forgot1.json().ok).toBe(true);
    expect(sentMails).toHaveLength(1);
    const firstCode = sentMails[0]!.code;
    expect(firstCode).toMatch(/^\d{6}$/);

    // 3. Wrong code fails; 5 wrong attempts lock out the token (even the valid code fails afterward)
    const wrongCode = firstCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const badTry = await app.inject({
        method: 'POST',
        url: '/api/auth/email/reset-password',
        payload: {
          email: 'reset-pilot@gyrogon.com',
          code: wrongCode,
          newPassword: 'newPassword456'
        }
      });
      expect(badTry.statusCode).toBe(400);
      expect(badTry.json().code).toBe('RESET_CODE_INVALID');
    }

    const lockedTry = await app.inject({
      method: 'POST',
      url: '/api/auth/email/reset-password',
      payload: {
        email: 'reset-pilot@gyrogon.com',
        code: firstCode,
        newPassword: 'newPassword456'
      }
    });
    expect(lockedTry.statusCode).toBe(400);
    expect(lockedTry.json().code).toBe('RESET_CODE_INVALID');

    // 4. Request fresh code and reset password cleanly
    const forgot2 = await app.inject({
      method: 'POST',
      url: '/api/auth/email/forgot-password',
      payload: { email: 'reset-pilot@gyrogon.com', lang: 'en' }
    });
    expect(forgot2.statusCode).toBe(200);
    expect(sentMails).toHaveLength(2);
    const secondCode = sentMails[1]!.code;

    const resetOk = await app.inject({
      method: 'POST',
      url: '/api/auth/email/reset-password',
      payload: {
        email: 'reset-pilot@gyrogon.com',
        code: secondCode,
        newPassword: 'newPassword456'
      }
    });
    expect(resetOk.statusCode).toBe(200);
    const resetBody = resetOk.json();
    expect(resetBody.reset).toBe(true);
    expect(resetBody.accessToken).toBeTypeOf('string');
    expect(resetBody.player.email).toBe('reset-pilot@gyrogon.com');

    // Old password rejected, new password accepted
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/email/login',
      payload: { email: 'reset-pilot@gyrogon.com', password: 'oldPassword123' }
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/email/login',
      payload: { email: 'reset-pilot@gyrogon.com', password: 'newPassword456' }
    });
    expect(newLogin.statusCode).toBe(200);

    // Replaying already-used code is rejected
    const replayTry = await app.inject({
      method: 'POST',
      url: '/api/auth/email/reset-password',
      payload: {
        email: 'reset-pilot@gyrogon.com',
        code: secondCode,
        newPassword: 'anotherPassword789'
      }
    });
    expect(replayTry.statusCode).toBe(400);
    expect(replayTry.json().code).toBe('RESET_CODE_INVALID');
  });

  it('supports full Facebook OAuth redirect login, single-use handoff exchange, guest merge, and form-urlencoded data deletion', async () => {
    const prevAppId = process.env.FACEBOOK_APP_ID;
    const prevAppSecret = process.env.FACEBOOK_APP_SECRET;
    process.env.FACEBOOK_APP_ID = 'test-fb-app-123';
    process.env.FACEBOOK_APP_SECRET = 'test-fb-secret-xyz';

    try {
      const app = buildApp({
        oauthVerifier: {
          async exchangeFacebookCode(code, redirectUri) {
            expect(redirectUri).toBe('http://localhost:5173/api/auth/facebook/callback');
            return `fb-access-for-${code}`;
          },
          async verifyToken(provider, token) {
            expect(provider).toBe('facebook');
            expect(token).toBe('fb-access-for-meta-code-99');
            return {
              provider: 'facebook',
              providerSub: 'fb-oauth-user-777',
              displayName: 'Meta Pilot',
              email: 'metapilot@gyrogon.com',
              avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            };
          },
          verifyFacebookSignedRequest(signedRequest) {
            const [encodedSig, encodedPayload] = signedRequest.split('.');
            if (!encodedSig || !encodedPayload) return null;
            const expected = crypto
              .createHmac('sha256', 'test-fb-secret-xyz')
              .update(encodedPayload)
              .digest('base64')
              .replace(/=/g, '')
              .replace(/\+/g, '-')
              .replace(/\//g, '_');
            if (encodedSig !== expected) return null;
            const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
              user_id?: string;
            };
            return payload.user_id ? { userId: payload.user_id } : null;
          }
        }
      });

      const providersRes = await app.inject({ method: 'GET', url: '/api/auth/providers' });
      expect(providersRes.statusCode).toBe(200);
      expect(providersRes.json().facebook).toBe(true);

      // Guest earns +25 coins on device before clicking Facebook login
      const guestRes = await app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        payload: { deviceId: 'dev-fb-guest-1' }
      });
      expect(guestRes.statusCode).toBe(200);
      const guestToken = guestRes.json().accessToken as string;
      await app.inject({
        method: 'POST',
        url: '/api/player/checkin',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      // 1. Start OAuth redirect and inspect state param
      const startRes = await app.inject({
        method: 'GET',
        url: '/api/auth/facebook/start?origin=http://localhost:5173&deviceId=dev-fb-guest-1'
      });
      expect(startRes.statusCode).toBe(302);
      const fbUrl = new URL(startRes.headers.location as string);
      expect(fbUrl.origin).toBe('https://www.facebook.com');
      expect(fbUrl.searchParams.get('client_id')).toBe('test-fb-app-123');
      expect(fbUrl.searchParams.get('scope')).toBe('public_profile,email');
      const stateParam = fbUrl.searchParams.get('state')!;
      expect(stateParam).toBeTruthy();

      // 2. Callback exchanges code, adopts Facebook name/avatar/email, and issues 60s single-use handoff
      const cbRes = await app.inject({
        method: 'GET',
        url: `/api/auth/facebook/callback?code=meta-code-99&state=${encodeURIComponent(stateParam)}`
      });
      expect(cbRes.statusCode).toBe(302);
      const redirectBack = cbRes.headers.location as string;
      expect(redirectBack.startsWith('http://localhost:5173/#fb_auth=')).toBe(true);
      const handoff = decodeURIComponent(redirectBack.split('#fb_auth=')[1]!);

      // 3. Exchange handoff -> receives JWTs, GyroPilot<N> replaced with Meta Pilot, coins preserved
      const exRes = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth/exchange',
        payload: { code: handoff }
      });
      expect(exRes.statusCode).toBe(200);
      const exBody = exRes.json();
      expect(exBody.loggedIn).toBe(true);
      expect(exBody.provider).toBe('facebook');
      expect(exBody.player.displayName).toBe('Meta Pilot');
      expect(exBody.player.email).toBe('metapilot@gyrogon.com');
      expect(exBody.player.hexaCoins).toBe(125);
      expect(exBody.player.linkedProviders.facebook).toBe(true);

      // Single-use enforcement: reusing the same handoff fails with 400 OAUTH_CODE_INVALID
      const replayEx = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth/exchange',
        payload: { code: handoff }
      });
      expect(replayEx.statusCode).toBe(400);
      expect(replayEx.json().code).toBe('OAUTH_CODE_INVALID');

      // 4. Meta sends Data Deletion Callback as application/x-www-form-urlencoded
      const payloadB64 = Buffer.from(JSON.stringify({ user_id: 'fb-oauth-user-777' }))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const sigB64 = crypto
        .createHmac('sha256', 'test-fb-secret-xyz')
        .update(payloadB64)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      const delRes = await app.inject({
        method: 'POST',
        url: '/api/auth/facebook/data-deletion',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `signed_request=${encodeURIComponent(`${sigB64}.${payloadB64}`)}`
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().deleted).toBe(true);
      expect(delRes.json().confirmation_code).toMatch(/^HEXDEL-/);
    } finally {
      if (prevAppId === undefined) delete process.env.FACEBOOK_APP_ID;
      else process.env.FACEBOOK_APP_ID = prevAppId;
      if (prevAppSecret === undefined) delete process.env.FACEBOOK_APP_SECRET;
      else process.env.FACEBOOK_APP_SECRET = prevAppSecret;
    }
  });

  it('supports full Google OAuth redirect flow, handoff exchange, guest merge, and provider state guard', async () => {
    const prevClientId = process.env.GOOGLE_CLIENT_ID;
    const prevClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret-xyz';

    try {
      const app = await buildApp({
        enableLeaderboardCache: false,
        oauthVerifier: {
          async exchangeGoogleCode(code, redirectUri) {
            expect(code).toBe('google-code-42');
            expect(redirectUri).toBe('http://localhost:5173/api/auth/google/callback');
            return 'mock-google-id-token';
          },
          async verifyToken(provider, token) {
            expect(provider).toBe('google');
            expect(token).toBe('mock-google-id-token');
            return {
              provider: 'google',
              providerSub: 'google-oauth-sub-888',
              displayName: 'Google Pilot',
              email: 'googlepilot@gyrogon.com',
              avatarUrl:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            };
          },
          verifyFacebookSignedRequest() {
            return null;
          }
        }
      });

      const providersRes = await app.inject({ method: 'GET', url: '/api/auth/providers' });
      expect(providersRes.statusCode).toBe(200);
      expect(providersRes.json().google).toBe(true);

      // Guest earns +25 coins on device before clicking Google login
      const guestRes = await app.inject({
        method: 'POST',
        url: '/api/auth/guest',
        payload: { deviceId: 'dev-google-guest-1' }
      });
      expect(guestRes.statusCode).toBe(200);
      const guestToken = guestRes.json().accessToken as string;
      await app.inject({
        method: 'POST',
        url: '/api/player/checkin',
        headers: { authorization: `Bearer ${guestToken}` }
      });

      // 1. Start OAuth redirect and inspect Google params + state
      const startRes = await app.inject({
        method: 'GET',
        url: '/api/auth/google/start?origin=http://localhost:5173&deviceId=dev-google-guest-1'
      });
      expect(startRes.statusCode).toBe(302);
      const googleUrl = new URL(startRes.headers.location as string);
      expect(googleUrl.origin).toBe('https://accounts.google.com');
      expect(googleUrl.pathname).toBe('/o/oauth2/v2/auth');
      expect(googleUrl.searchParams.get('client_id')).toBe(
        'test-google-client-id.apps.googleusercontent.com'
      );
      expect(googleUrl.searchParams.get('scope')).toBe('openid email profile');
      expect(googleUrl.searchParams.get('prompt')).toBe('select_account');
      const stateParam = googleUrl.searchParams.get('state')!;
      expect(stateParam).toBeTruthy();

      // 2. Cross-provider state protection: Google state must be rejected on Facebook callback
      const crossRes = await app.inject({
        method: 'GET',
        url: `/api/auth/facebook/callback?code=some-code&state=${encodeURIComponent(stateParam)}`
      });
      expect(crossRes.statusCode).toBe(302);
      expect(crossRes.headers.location).toBe('http://localhost:5173/#fb_error=invalid_state');

      // 3. Callback exchanges code, adopts Google name/avatar/email, and issues 60s single-use handoff
      const cbRes = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=google-code-42&state=${encodeURIComponent(stateParam)}`
      });
      expect(cbRes.statusCode).toBe(302);
      const redirectBack = cbRes.headers.location as string;
      expect(redirectBack.startsWith('http://localhost:5173/#google_auth=')).toBe(true);
      const handoff = decodeURIComponent(redirectBack.split('#google_auth=')[1]!);

      // 4. Exchange handoff -> receives JWTs, GyroPilot<N> replaced with Google Pilot, coins preserved
      const exRes = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth/exchange',
        payload: { code: handoff }
      });
      expect(exRes.statusCode).toBe(200);
      const exBody = exRes.json();
      expect(exBody.loggedIn).toBe(true);
      expect(exBody.provider).toBe('google');
      expect(exBody.player.displayName).toBe('Google Pilot');
      expect(exBody.player.email).toBe('googlepilot@gyrogon.com');
      expect(exBody.player.hexaCoins).toBe(125);
      expect(exBody.player.linkedProviders.google).toBe(true);

      // Single-use enforcement: reusing the same handoff fails with 400 OAUTH_CODE_INVALID
      const replayEx = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth/exchange',
        payload: { code: handoff }
      });
      expect(replayEx.statusCode).toBe(400);
      expect(replayEx.json().code).toBe('OAUTH_CODE_INVALID');
    } finally {
      if (prevClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = prevClientId;
      if (prevClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = prevClientSecret;
    }
  });
});
