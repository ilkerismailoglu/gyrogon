import crypto from 'node:crypto';
import { HexacoreSimulator } from '@hexacore/game-core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryGameStore } from '../src/services/store.js';

describe('@hexacore/backend API (Faz 1 + Faz 3)', () => {
  it('returns health (with store & leaderboard engines) and daily seed', async () => {
    const app = buildApp();

    const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json()).toMatchObject({
      ok: true,
      service: 'hexacore-backend',
      store: 'memory',
      leaderboard: 'memory'
    });

    const dailyRes = await app.inject({ method: 'GET', url: '/api/daily' });
    expect(dailyRes.statusCode).toBe(200);
    expect(dailyRes.json().seed).toMatch(/^HEXACORE-DAILY-/);
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

    const sim = new HexacoreSimulator(seed);
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

    // New player starts with 100 coins and hextris (Theme 1) equipped by default
    const shopRes = await app.inject({ method: 'GET', url: '/api/shop/items', headers });
    expect(shopRes.statusCode).toBe(200);
    const shop = shopRes.json();
    expect(shop.hexaCoins).toBe(100);
    expect(shop.equippedTheme).toBe('hextris');
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

    // Switch back to cyberpunk -> 200
    const equipOk = await app.inject({
      method: 'POST',
      url: '/api/shop/equip',
      headers,
      payload: { itemCode: 'cyberpunk' }
    });
    expect(equipOk.statusCode).toBe(200);
    expect(equipOk.json().equippedTheme).toBe('cyberpunk');
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
      playerName: 'HexaPlayer',
      verified: false,
      finalScore: null,
      startedAt: new Date().toISOString()
    });
    await store.finalizeVerifiedSession({
      sessionId: sessId,
      userId: p.id,
      playerName: 'HexaPlayer',
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
      .createHmac('sha256', 'hexacore-dev-fb-secret')
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

      const sim = new HexacoreSimulator(seed, sides);
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
});
