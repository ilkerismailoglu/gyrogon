import { describe, expect, it } from 'vitest';
import {
  DELETE_ANIM_TICKS,
  GyrogonSimulator,
  MAX_ROWS,
  Mulberry32,
  SUPPORTED_SIDES,
  getDailySeed,
  verifyGameReplay
} from '../src/index.js';

describe('@gyrogon/game-core', () => {
  it('produces identical PRNG sequences for the same seed', () => {
    const a = new Mulberry32('GYROGON-TEST-SEED');
    const b = new Mulberry32('GYROGON-TEST-SEED');
    const seqA = Array.from({ length: 12 }, () => a.nextInt(0, 1000));
    const seqB = Array.from({ length: 12 }, () => b.nextInt(0, 1000));
    expect(seqA).toEqual(seqB);
    expect(getDailySeed('2026-11-19')).toBe('GYROGON-DAILY-2026-11-19');
  });

  it('matches wrapped modular neighbors across side 5 and side 0 via BFS', () => {
    const sim = new GyrogonSimulator('bfs-wrap');
    sim.placeBlockForTest(5, 2);
    sim.placeBlockForTest(0, 2);
    const events = sim.placeBlockForTest(1, 2);

    const clearEvent = events.find((e) => e.type === 'CLEAR');
    expect(clearEvent).toBeDefined();
    expect(sim.score).toBe(3 * 3 * 10); // 90
    expect(sim.blocksCleared).toBe(3);

    // Advance past delete animation ticks so blocks vanish from stacks
    for (let i = 0; i <= DELETE_ANIM_TICKS; i++) {
      sim.stepTick();
    }
    expect(sim.grid[5]?.length).toBe(0);
    expect(sim.grid[0]?.length).toBe(0);
    expect(sim.grid[1]?.length).toBe(0);
  });

  it('drops upper blocks with radial gravity and triggers cascade matches', () => {
    const sim = new GyrogonSimulator('cascade-real');
    sim.placeBlockForTest(0, 2); // row 0
    sim.placeBlockForTest(0, 1); // row 1
    sim.placeBlockForTest(1, 2); // row 0
    sim.placeBlockForTest(1, 1); // row 1
    sim.placeBlockForTest(2, 1); // row 0!
    expect(sim.score).toBe(0);

    // Drop color 2 on side 5 -> matches side 5(0), side 0(0), side 1(0) all color 2!
    sim.placeBlockForTest(5, 2);
    expect(sim.score).toBe(90); // 3 blocks * 3 * 10 * combo 1

    // Step ticks so delete animation completes and row 1 blocks on side 0 & side 1 fall to row 0,
    // meeting side 2 row 0 (color 1) for a 3-block cascade!
    for (let i = 0; i < 40; i++) {
      sim.stepTick();
    }

    expect(sim.blocksCleared).toBe(6);
    expect(sim.combo).toBe(2);
    expect(sim.score).toBe(90 + 3 * 3 * 10 * 2); // 270
  });

  it('supports bomb, joker, freeze power-ups and one-time revive', () => {
    const sim = new GyrogonSimulator('powerups');
    sim.placeBlockForTest(0, 0);
    sim.placeBlockForTest(1, 0);
    // Joker adopts neighbor color 0 and clears 3 blocks
    sim.placeBlockForTest(2, 3, 'joker');
    expect(sim.blocksCleared).toBe(3);

    // Freeze slows down falling speed for 240 ticks
    sim.placeBlockForTest(3, 1, 'freeze');
    expect(sim.freezeTicksLeft).toBe(240);

    // Bomb clears neighboring cells immediately
    sim.placeBlockForTest(4, 2);
    sim.placeBlockForTest(4, 3);
    const bombEvents = sim.placeBlockForTest(4, 1, 'bomb');
    expect(bombEvents.some((e) => e.type === 'POWERUP' && e.kind === 'bomb')).toBe(true);

    // Overflow side 0 to trigger GAMEOVER and test REVIVE
    const simOver = new GyrogonSimulator('revive-test');
    for (let r = 0; r < MAX_ROWS; r++) {
      simOver.placeBlockForTest(0, r % 2 === 0 ? 0 : 1);
    }
    simOver.stepTick();
    expect(simOver.status).toBe('GAMEOVER');

    const revEvents = simOver.applyMove('REVIVE');
    expect(revEvents.some((e) => e.type === 'REVIVE')).toBe(true);
    expect(simOver.status).toBe('PLAYING');
    expect(simOver.revivesUsed).toBe(1);
    expect(simOver.grid[0]?.length).toBeLessThanOrEqual(MAX_ROWS - 3);
  });

  it('deterministically verifies valid replays and rejects tampered scores', () => {
    const seed = 'ANTI-CHEAT-SESSION-42';
    const sim = new GyrogonSimulator(seed);

    let safety = 0;
    while (sim.status !== 'GAMEOVER' && safety < 60 * 120) {
      if (sim.tick % 45 === 10) {
        sim.applyMove('ROTATE_RIGHT');
      } else if (sim.tick % 90 === 35) {
        sim.applyMove('ROTATE_LEFT');
      }
      if (sim.tick === 120) {
        sim.applyMove('FAST_DROP_ON');
      }
      if (sim.tick === 180) {
        sim.applyMove('FAST_DROP_OFF');
      }
      sim.stepTick();
      safety += 1;
    }

    expect(sim.status).toBe('GAMEOVER');

    const ok = verifyGameReplay(seed, sim.recordedMoves, sim.score);
    expect(ok.valid).toBe(true);
    expect(ok.simulatedScore).toBe(sim.score);

    const cheated = verifyGameReplay(seed, sim.recordedMoves, sim.score + 500);
    expect(cheated.valid).toBe(false);
  });

  it('supports all polygon modes (3, 4, 5, 6, 7, 8 sides) with wrap-around BFS and replay verification', () => {
    for (const sides of SUPPORTED_SIDES) {
      // Wrap-around BFS across last side (sides - 1) and side 0
      const bfsSim = new GyrogonSimulator(`bfs-${sides}`, sides);
      bfsSim.placeBlockForTest(sides - 1, 1);
      bfsSim.placeBlockForTest(0, 1);
      bfsSim.placeBlockForTest(1, 1);
      expect(bfsSim.blocksCleared).toBe(3);

      // Full deterministic run + anti-cheat verification for each polygon count
      const seed = `POLY-RUN-${sides}`;
      const sim = new GyrogonSimulator(seed, sides);
      let guard = 0;
      while (sim.status !== 'GAMEOVER' && guard < 60 * 240) {
        if (sim.tick % 50 === 10) sim.applyMove('ROTATE_RIGHT');
        sim.stepTick();
        guard += 1;
      }
      expect(sim.status).toBe('GAMEOVER');

      const verifyOk = verifyGameReplay(seed, sim.recordedMoves, sim.score, sides);
      expect(verifyOk.valid).toBe(true);
      expect(verifyOk.simulatedScore).toBe(sim.score);
    }
  });
});
