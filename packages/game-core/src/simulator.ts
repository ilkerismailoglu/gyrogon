import {
  COMBO_DURATION_TICKS,
  DEFAULT_SIDES,
  DELETE_ANIM_TICKS,
  EngineEvent,
  FallingBlock,
  GameStatus,
  GridBlock,
  MoveAction,
  PolygonGeometry,
  PolygonSides,
  RecordedMove,
  ReplayVerificationResult,
  TICK_DT,
  getPolygonGeometry
} from './types.js';
import { WaveDirector } from './waveDirector.js';

export class HexacoreSimulator {
  readonly seed: string;
  readonly sides: PolygonSides;
  readonly geo: PolygonGeometry;
  private readonly waveDirector: WaveDirector;

  tick = 0;
  status: GameStatus = 'PLAYING';
  score = 0;
  combo = 1;
  comboTicksLeft = 0;
  lastClearedColor = 0;
  maxCombo = 1;
  blocksCleared = 0;
  coinsEarned = 0;
  revivesUsed = 0;
  freezeTicksLeft = 0;
  rotationSteps = 0;
  fastDrop = false;
  difficulty = 0;

  grid: GridBlock[][];
  fallingBlocks: FallingBlock[] = [];
  recordedMoves: RecordedMove[] = [];

  private nextGridBlockId = 1;
  private dangerEmitted = false;

  constructor(seed: string, sides: PolygonSides = DEFAULT_SIDES) {
    this.seed = seed;
    this.sides = sides;
    this.geo = getPolygonGeometry(sides);
    this.waveDirector = new WaveDirector(seed, sides);
    this.grid = Array.from({ length: sides }, () => []);
  }

  /** Applies a player move at the current simulation tick and returns emitted events. */
  applyMove(action: MoveAction, record = true): EngineEvent[] {
    const events: EngineEvent[] = [];

    if (action === 'REVIVE') {
      if (this.status === 'GAMEOVER' && this.revivesUsed === 0) {
        if (record) {
          this.recordedMoves.push({ tick: this.tick, action });
        }
        const clearedBlocks = this.executeRevive();
        events.push({ type: 'REVIVE', tick: this.tick, clearedBlocks });
      }
      return events;
    }

    if (this.status !== 'PLAYING') {
      return events;
    }

    if (record) {
      this.recordedMoves.push({ tick: this.tick, action });
    }

    switch (action) {
      case 'ROTATE_LEFT':
        this.rotationSteps = (this.rotationSteps + this.sides - 1) % this.sides;
        events.push({
          type: 'ROTATE',
          tick: this.tick,
          dir: -1,
          rotationSteps: this.rotationSteps
        });
        break;
      case 'ROTATE_RIGHT':
        this.rotationSteps = (this.rotationSteps + 1) % this.sides;
        events.push({
          type: 'ROTATE',
          tick: this.tick,
          dir: 1,
          rotationSteps: this.rotationSteps
        });
        break;
      case 'FAST_DROP_ON':
        this.fastDrop = true;
        break;
      case 'FAST_DROP_OFF':
        this.fastDrop = false;
        break;
    }

    return events;
  }

  /** Advances the entire game state by exactly 1 deterministic tick (1/60s). */
  stepTick(): EngineEvent[] {
    const events: EngineEvent[] = [];
    if (this.status !== 'PLAYING') {
      return events;
    }

    const { coreRadius, blockThickness, maxRows } = this.geo;

    this.tick += 1;
    this.difficulty = this.waveDirector.computeDifficulty(this.score, this.tick);

    // 1. Timers (Freeze & Combo)
    if (this.freezeTicksLeft > 0) {
      this.freezeTicksLeft -= 1;
    }
    if (this.combo > 1) {
      this.comboTicksLeft -= 1;
      if (this.comboTicksLeft <= 0) {
        this.combo = 1;
        this.comboTicksLeft = 0;
        events.push({ type: 'COMBO_RESET', tick: this.tick });
      }
    }

    // 2. Spawn waves
    const spawned = this.waveDirector.step(this.score, this.tick, this.freezeTicksLeft > 0);
    if (spawned.length > 0) {
      this.fallingBlocks.push(...spawned);
    }

    // 3. Advance falling blocks & lock onto core sides
    const fallSpeed =
      this.waveDirector.getFallSpeed(this.difficulty, this.freezeTicksLeft > 0) *
      (this.fastDrop ? 2.8 : 1);

    for (let i = this.fallingBlocks.length - 1; i >= 0; i--) {
      const fb = this.fallingBlocks[i];
      if (!fb) continue;

      fb.dist -= fallSpeed * TICK_DT;
      const localSide = this.laneToLocalSide(fb.lane);
      const stack = this.grid[localSide];
      if (!stack) continue;

      const landingRadius = coreRadius + stack.length * blockThickness;
      if (fb.dist <= landingRadius) {
        this.fallingBlocks.splice(i, 1);
        const placedRow = stack.length;
        const gridBlock: GridBlock = {
          id: this.nextGridBlockId++,
          colorIndex: fb.colorIndex,
          powerUp: fb.powerUp,
          dist: landingRadius,
          settled: true,
          fallSpeed: 0,
          deleteTicks: 0,
          tint: 1,
          needsCheck: true
        };
        stack.push(gridBlock);

        events.push({
          type: 'LOCK',
          tick: this.tick,
          side: localSide,
          row: placedRow,
          colorIndex: gridBlock.colorIndex,
          powerUp: gridBlock.powerUp
        });

        this.handlePowerUpOnLock(localSide, placedRow, gridBlock, events);
      }
    }

    // 4. Advance deletion flash animations & trigger radial gravity drops for blocks above
    for (let s = 0; s < this.sides; s++) {
      const stack = this.grid[s];
      if (!stack) continue;

      let removedAnyOnSide = false;
      let lowestRemovedIdx = Number.POSITIVE_INFINITY;
      for (let r = 0; r < stack.length; r++) {
        const block = stack[r];
        if (!block) continue;

        if (block.tint > 0) {
          block.tint = Math.max(0, block.tint - 0.08);
        }

        if (block.deleteTicks > 0) {
          block.deleteTicks -= 1;
          if (block.deleteTicks === 0) {
            stack.splice(r, 1);
            removedAnyOnSide = true;
            if (r < lowestRemovedIdx) {
              lowestRemovedIdx = r;
            }
            r -= 1;
          }
        }
      }

      if (removedAnyOnSide && lowestRemovedIdx < stack.length) {
        for (let r = lowestRemovedIdx; r < stack.length; r++) {
          const upper = stack[r];
          if (upper && upper.deleteTicks === 0) {
            upper.settled = false;
            upper.fallSpeed = 240;
          }
        }
      }
    }

    // 5. Radial gravity simulation for unsettled blocks in stacks
    for (let s = 0; s < this.sides; s++) {
      const stack = this.grid[s];
      if (!stack) continue;

      for (let r = 0; r < stack.length; r++) {
        const block = stack[r];
        if (!block || block.settled || block.deleteTicks > 0) continue;

        const targetRadius =
          r === 0
            ? coreRadius
            : (stack[r - 1]?.settled ?? false)
              ? (stack[r - 1]?.dist ?? coreRadius) + blockThickness
              : -1;

        block.fallSpeed = Math.min(420, block.fallSpeed + 600 * TICK_DT);
        block.dist -= block.fallSpeed * TICK_DT;

        if (targetRadius > 0 && block.dist <= targetRadius) {
          block.dist = targetRadius;
          block.settled = true;
          block.fallSpeed = 0;
          block.tint = 0.65;
          block.needsCheck = true;
        } else if (r > 0) {
          const below = stack[r - 1];
          if (below && block.dist <= below.dist + blockThickness) {
            block.dist = below.dist + blockThickness;
            if (below.settled) {
              block.settled = true;
              block.fallSpeed = 0;
              block.needsCheck = true;
            }
          }
        }
      }
    }

    // 6. Run BFS match checks for newly settled blocks
    this.runMatchChecks(events);

    // 7. Danger check & GameOver condition
    let maxActiveStack = 0;
    for (let s = 0; s < this.sides; s++) {
      const stack = this.grid[s];
      if (!stack) continue;
      let activeCount = 0;
      for (const b of stack) {
        if (b.deleteTicks === 0) {
          activeCount += 1;
        }
      }
      if (activeCount > maxActiveStack) {
        maxActiveStack = activeCount;
      }
    }

    if (maxActiveStack >= maxRows - 2 && !this.dangerEmitted) {
      this.dangerEmitted = true;
      events.push({ type: 'DANGER', tick: this.tick, maxStack: maxActiveStack });
    } else if (maxActiveStack < maxRows - 2) {
      this.dangerEmitted = false;
    }

    if (maxActiveStack >= maxRows) {
      this.status = 'GAMEOVER';
      this.fastDrop = false;
      events.push({ type: 'GAMEOVER', tick: this.tick, score: this.score });
    }

    return events;
  }

  /** Maps a world lane index to the current local polygon side index. */
  laneToLocalSide(lane: number): number {
    return ((lane - this.rotationSteps) % this.sides + this.sides) % this.sides;
  }

  /** Directly places a block onto a local polygon side (useful for deterministic unit tests). */
  placeBlockForTest(
    side: number,
    colorIndex: number,
    powerUp: GridBlock['powerUp'] = 'none'
  ): EngineEvent[] {
    const stack = this.grid[side];
    if (!stack) return [];
    const row = stack.length;
    const block: GridBlock = {
      id: this.nextGridBlockId++,
      colorIndex,
      powerUp,
      dist: this.geo.coreRadius + row * this.geo.blockThickness,
      settled: true,
      fallSpeed: 0,
      deleteTicks: 0,
      tint: 1,
      needsCheck: true
    };
    stack.push(block);

    const events: EngineEvent[] = [
      { type: 'LOCK', tick: this.tick, side, row, colorIndex, powerUp }
    ];
    this.handlePowerUpOnLock(side, row, block, events);
    this.runMatchChecks(events);
    return events;
  }

  private handlePowerUpOnLock(
    side: number,
    row: number,
    block: GridBlock,
    events: EngineEvent[]
  ): void {
    if (block.powerUp === 'none') return;

    if (block.powerUp === 'freeze') {
      this.freezeTicksLeft = 240;
      events.push({ type: 'POWERUP', tick: this.tick, kind: 'freeze', side, row });
      return;
    }

    if (block.powerUp === 'joker') {
      const adoptedColor = this.pickBestJokerColor(side, row, block.colorIndex);
      block.colorIndex = adoptedColor;
      events.push({ type: 'POWERUP', tick: this.tick, kind: 'joker', side, row });
      return;
    }

    if (block.powerUp === 'bomb') {
      events.push({ type: 'POWERUP', tick: this.tick, kind: 'bomb', side, row });
      const blastCells: Array<{ side: number; row: number }> = [
        { side, row },
        { side, row: row - 1 },
        { side, row: row - 2 },
        { side: (side + 1) % this.sides, row },
        { side: (side + 1) % this.sides, row: row - 1 },
        { side: (side + this.sides - 1) % this.sides, row },
        { side: (side + this.sides - 1) % this.sides, row: row - 1 }
      ];

      const clearedCells: Array<{
        side: number;
        row: number;
        colorIndex: number;
        powerUp: GridBlock['powerUp'];
      }> = [];

      for (const cell of blastCells) {
        const targetStack = this.grid[cell.side];
        const target = targetStack?.[cell.row];
        if (target && target.deleteTicks === 0) {
          target.deleteTicks = DELETE_ANIM_TICKS;
          target.needsCheck = false;
          clearedCells.push({
            side: cell.side,
            row: cell.row,
            colorIndex: target.colorIndex,
            powerUp: target.powerUp
          });
        }
      }

      if (clearedCells.length > 0) {
        this.awardClearScore(clearedCells, events);
      }
    }
  }

  private pickBestJokerColor(side: number, row: number, fallback: number): number {
    const counts = new Map<number, number>();
    const candidates: Array<[number, number]> = [
      [side, row - 1],
      [(side + 1) % this.sides, row],
      [(side + this.sides - 1) % this.sides, row]
    ];

    for (const [cs, cr] of candidates) {
      const nb = this.grid[cs]?.[cr];
      if (nb && nb.deleteTicks === 0) {
        counts.set(nb.colorIndex, (counts.get(nb.colorIndex) ?? 0) + 1);
      }
    }

    let bestColor = fallback;
    let bestCount = 0;
    for (const [color, count] of counts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestColor = color;
      }
    }
    return bestColor;
  }

  private runMatchChecks(events: EngineEvent[]): void {
    const visited: boolean[][] = Array.from({ length: this.sides }, (_, s) =>
      Array(this.grid[s]?.length ?? 0).fill(false)
    );

    const matchedCells: Array<{
      side: number;
      row: number;
      colorIndex: number;
      powerUp: GridBlock['powerUp'];
    }> = [];

    for (let s = 0; s < this.sides; s++) {
      const stack = this.grid[s];
      if (!stack) continue;

      for (let r = 0; r < stack.length; r++) {
        const startBlock = stack[r];
        if (
          !startBlock ||
          !startBlock.needsCheck ||
          !startBlock.settled ||
          startBlock.deleteTicks > 0 ||
          visited[s]?.[r]
        ) {
          continue;
        }

        startBlock.needsCheck = false;
        const targetColor = startBlock.colorIndex;
        const queue: Array<[number, number]> = [[s, r]];
        const cluster: Array<[number, number]> = [];
        const startVis = visited[s];
        if (startVis) startVis[r] = true;

        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          const [cs, cr] = item;
          cluster.push([cs, cr]);

          const neighbors: Array<[number, number]> = [
            [(cs + 1) % this.sides, cr],
            [(cs + this.sides - 1) % this.sides, cr],
            [cs, cr - 1],
            [cs, cr + 1]
          ];

          for (const [ns, nr] of neighbors) {
            const nStack = this.grid[ns];
            const nVis = visited[ns];
            if (!nStack || !nVis || nr < 0 || nr >= nStack.length || nVis[nr]) {
              continue;
            }
            const nb = nStack[nr];
            if (
              nb &&
              nb.settled &&
              nb.deleteTicks === 0 &&
              nb.colorIndex === targetColor
            ) {
              nVis[nr] = true;
              queue.push([ns, nr]);
            }
          }
        }

        if (cluster.length >= 3) {
          for (const [cs, cr] of cluster) {
            const block = this.grid[cs]?.[cr];
            if (block && block.deleteTicks === 0) {
              block.deleteTicks = DELETE_ANIM_TICKS;
              block.needsCheck = false;
              matchedCells.push({
                side: cs,
                row: cr,
                colorIndex: block.colorIndex,
                powerUp: block.powerUp
              });
            }
          }
        }
      }
    }

    if (matchedCells.length > 0) {
      this.awardClearScore(matchedCells, events);
    }
  }

  private awardClearScore(
    cells: Array<{ side: number; row: number; colorIndex: number; powerUp: GridBlock['powerUp'] }>,
    events: EngineEvent[]
  ): void {
    const activeCombo = this.comboTicksLeft > 0 ? Math.min(this.combo + 1, 12) : 1;
    this.combo = activeCombo;
    this.comboTicksLeft = COMBO_DURATION_TICKS;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    const firstCell = cells[0];
    if (firstCell) {
      this.lastClearedColor = firstCell.colorIndex;
    }

    const count = cells.length;
    const gainedScore = count * count * 10 * this.combo;
    const gainedCoins = Math.max(1, Math.floor(count / 2) + (this.combo > 1 ? 1 : 0));

    this.score += gainedScore;
    this.blocksCleared += count;
    this.coinsEarned += gainedCoins;

    events.push({
      type: 'CLEAR',
      tick: this.tick,
      cells,
      gainedScore,
      gainedCoins,
      combo: this.combo
    });
  }

  private executeRevive(): number {
    this.revivesUsed += 1;
    let cleared = 0;
    const { coreRadius, blockThickness, maxRows, spawnRadius } = this.geo;

    const safeLimit = Math.max(2, maxRows - 3);
    for (let s = 0; s < this.sides; s++) {
      const stack = this.grid[s];
      if (!stack) continue;
      if (stack.length > safeLimit) {
        cleared += stack.length - safeLimit;
        stack.length = safeLimit;
      }
      for (let r = 0; r < stack.length; r++) {
        const b = stack[r];
        if (b) {
          b.deleteTicks = 0;
          b.settled = true;
          b.dist = coreRadius + r * blockThickness;
        }
      }
    }

    const safeFallingDist = Math.max(
      spawnRadius * 0.72,
      coreRadius + (maxRows - 1) * blockThickness
    );
    for (const fb of this.fallingBlocks) {
      if (fb.dist < safeFallingDist) {
        fb.dist = safeFallingDist;
      }
    }

    this.dangerEmitted = false;
    this.status = 'PLAYING';
    return cleared;
  }

  getSnapshot() {
    return {
      tick: this.tick,
      sides: this.sides,
      status: this.status,
      score: this.score,
      combo: this.combo,
      comboTicksLeft: this.comboTicksLeft,
      comboDurationTicks: COMBO_DURATION_TICKS,
      lastClearedColor: this.lastClearedColor,
      maxCombo: this.maxCombo,
      blocksCleared: this.blocksCleared,
      coinsEarned: this.coinsEarned,
      revivesUsed: this.revivesUsed,
      freezeTicksLeft: this.freezeTicksLeft,
      rotationSteps: this.rotationSteps,
      fastDrop: this.fastDrop,
      difficulty: this.difficulty,
      grid: this.grid,
      fallingBlocks: this.fallingBlocks
    };
  }
}

/**
 * Deterministically replays a recorded move log on the server to validate a claimed score.
 */
export function verifyGameReplay(
  seed: string,
  moves: RecordedMove[],
  claimedScore: number,
  sides: PolygonSides = DEFAULT_SIDES,
  maxTotalTicks = 60 * 60 * 15
): ReplayVerificationResult {
  if (!Number.isFinite(claimedScore) || claimedScore < 0) {
    return {
      valid: false,
      simulatedScore: 0,
      claimedScore,
      maxCombo: 1,
      blocksCleared: 0,
      coinsEarned: 0,
      finalStatus: 'PLAYING',
      reason: 'Invalid claimedScore'
    };
  }

  let prevTick = 0;
  for (const m of moves) {
    if (!Number.isInteger(m.tick) || m.tick < prevTick || m.tick > maxTotalTicks) {
      return {
        valid: false,
        simulatedScore: 0,
        claimedScore,
        maxCombo: 1,
        blocksCleared: 0,
        coinsEarned: 0,
        finalStatus: 'PLAYING',
        reason: 'Invalid or non-monotonic move tick'
      };
    }
    prevTick = m.tick;
  }

  const sim = new HexacoreSimulator(seed, sides);
  let moveIdx = 0;

  while (moveIdx < moves.length && moves[moveIdx]?.tick === 0) {
    const m = moves[moveIdx];
    if (m) sim.applyMove(m.action, false);
    moveIdx += 1;
  }

  const tailCap = Math.min(maxTotalTicks, prevTick + 60 * 120);
  while (sim.tick < tailCap) {
    if (sim.status === 'GAMEOVER') {
      const nextMove = moves[moveIdx];
      if (nextMove && nextMove.action === 'REVIVE') {
        while (sim.tick < nextMove.tick) {
          sim.tick += 1;
        }
        sim.applyMove('REVIVE', false);
        moveIdx += 1;
      } else {
        break;
      }
    }

    sim.stepTick();

    while (moveIdx < moves.length && (moves[moveIdx]?.tick ?? -1) <= sim.tick) {
      const m = moves[moveIdx];
      if (m) {
        sim.applyMove(m.action, false);
      }
      moveIdx += 1;
    }

    if (sim.score === claimedScore && moveIdx >= moves.length && sim.status === 'GAMEOVER') {
      break;
    }
  }

  const valid = sim.score === claimedScore;
  return {
    valid,
    simulatedScore: sim.score,
    claimedScore,
    maxCombo: sim.maxCombo,
    blocksCleared: sim.blocksCleared,
    coinsEarned: sim.coinsEarned,
    finalStatus: sim.status,
    reason: valid
      ? undefined
      : `Score mismatch: simulated=${sim.score}, claimed=${claimedScore}`
  };
}
