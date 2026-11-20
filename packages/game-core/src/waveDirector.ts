import { Mulberry32 } from './prng.js';
import {
  BlockPowerUp,
  COLOR_COUNT,
  DEFAULT_SIDES,
  FallingBlock,
  LOGIC_TPS,
  PolygonGeometry,
  PolygonSides,
  WavePattern,
  getPolygonGeometry
} from './types.js';

export class WaveDirector {
  private readonly prng: Mulberry32;
  private readonly geo: PolygonGeometry;
  private nextBlockId = 1;
  private currentPattern: WavePattern = 'single';
  private patternStepsLeft = 4;
  private spiralIndex = 0;
  private spiralDir: 1 | -1 = 1;
  private ticksUntilNextWave = 25;
  private totalWavesSpawned = 0;
  private lastPowerUpWave = -10;

  constructor(seed: string | number, sides: PolygonSides = DEFAULT_SIDES) {
    this.prng = new Mulberry32(seed);
    this.geo = getPolygonGeometry(sides);
  }

  /** Computes normalized difficulty scalar in [0, 1] from score and elapsed ticks. */
  computeDifficulty(score: number, tick: number): number {
    const scoreFactor = Math.min(score / 6000, 0.7);
    const timeFactor = Math.min(tick / (LOGIC_TPS * 180), 0.3);
    return Math.min(1, scoreFactor + timeFactor);
  }

  /** Computes current base fall speed in game units per second. */
  getFallSpeed(difficulty: number, freezeActive: boolean): number {
    // Slightly tune speed so 3-gon isn't unfairly fast and 7/8-gon stays crisp
    const sideScale = this.geo.sides === 3 ? 0.84 : this.geo.sides === 4 ? 0.92 : 1;
    const base = (76 + difficulty * 112) * sideScale;
    return freezeActive ? base * 0.35 : base;
  }

  /**
   * Advances spawn timer by 1 logic tick and returns newly spawned falling blocks.
   */
  step(score: number, tick: number, freezeActive: boolean): FallingBlock[] {
    const difficulty = this.computeDifficulty(score, tick);

    if (freezeActive && tick % 2 === 0) {
      return [];
    }

    this.ticksUntilNextWave -= 1;
    if (this.ticksUntilNextWave > 0) {
      return [];
    }

    const blocks = this.generateCurrentPattern(score, difficulty);
    this.totalWavesSpawned += 1;
    this.patternStepsLeft -= 1;

    const sideIntervalBonus = this.geo.sides === 3 ? 12 : this.geo.sides >= 7 ? -4 : 0;
    const baseIntervalTicks = Math.round(86 - difficulty * 50) + sideIntervalBonus;
    this.ticksUntilNextWave = Math.max(30, baseIntervalTicks + this.getPatternDelayBonus());

    if (this.patternStepsLeft <= 0) {
      this.pickNextPattern(difficulty);
    }

    return blocks;
  }

  private getPatternDelayBonus(): number {
    switch (this.currentPattern) {
      case 'fullCircle':
        return 34;
      case 'halfCircle':
        return 20;
      case 'spiral':
        return -14;
      case 'crosswise':
      case 'double':
        return 8;
      default:
        return 0;
    }
  }

  private pickNextPattern(difficulty: number): void {
    const roll = this.prng.nextFloat();
    const sides = this.geo.sides;

    if (roll < 0.44) {
      this.currentPattern = 'single';
      this.patternStepsLeft = this.prng.nextInt(3, 6);
    } else if (roll < 0.64) {
      this.currentPattern = 'double';
      this.patternStepsLeft = this.prng.nextInt(2, 4);
    } else if (roll < 0.78 && sides >= 4) {
      this.currentPattern = 'crosswise';
      this.patternStepsLeft = this.prng.nextInt(2, 4);
    } else if (roll < 0.90) {
      this.currentPattern = 'spiral';
      this.patternStepsLeft = this.prng.nextInt(sides, sides + 3);
      this.spiralDir = this.prng.chance(0.5) ? 1 : -1;
      this.spiralIndex = this.prng.nextInt(0, sides);
    } else if (roll < 0.96 || difficulty < 0.15) {
      this.currentPattern = 'halfCircle';
      this.patternStepsLeft = 1;
    } else {
      this.currentPattern = 'fullCircle';
      this.patternStepsLeft = 1;
    }
  }

  private maybePowerUp(score: number): BlockPowerUp {
    if (score < 120 || this.totalWavesSpawned - this.lastPowerUpWave < 9) {
      return 'none';
    }
    if (!this.prng.chance(0.11)) {
      return 'none';
    }
    this.lastPowerUpWave = this.totalWavesSpawned;
    const roll = this.prng.nextFloat();
    if (roll < 0.4) return 'bomb';
    if (roll < 0.75) return 'joker';
    return 'freeze';
  }

  private makeBlock(
    lane: number,
    colorIndex: number,
    speed: number,
    powerUp: BlockPowerUp = 'none'
  ): FallingBlock {
    const sides = this.geo.sides;
    return {
      id: this.nextBlockId++,
      lane: ((lane % sides) + sides) % sides,
      colorIndex: ((colorIndex % COLOR_COUNT) + COLOR_COUNT) % COLOR_COUNT,
      powerUp,
      dist: this.geo.spawnRadius,
      speed
    };
  }

  private generateCurrentPattern(score: number, difficulty: number): FallingBlock[] {
    const sides = this.geo.sides;
    const speed = this.getFallSpeed(difficulty, false);
    const randColor = () => this.prng.nextInt(0, COLOR_COUNT);
    const randLane = () => this.prng.nextInt(0, sides);

    switch (this.currentPattern) {
      case 'single': {
        const powerUp = this.maybePowerUp(score);
        return [this.makeBlock(randLane(), randColor(), speed, powerUp)];
      }

      case 'double': {
        const lane = randLane();
        return [
          this.makeBlock(lane, randColor(), speed),
          this.makeBlock(lane + 1, randColor(), speed)
        ];
      }

      case 'crosswise': {
        const lane = randLane();
        const color = randColor();
        const oppositeOffset = Math.max(1, Math.floor(sides / 2));
        return [
          this.makeBlock(lane, color, speed * 1.05),
          this.makeBlock(lane + oppositeOffset, color, speed * 1.05)
        ];
      }

      case 'halfCircle': {
        const startLane = randLane();
        const count = Math.max(2, Math.floor(sides / 2));
        const c1 = randColor();
        const c2 = (c1 + 1 + this.prng.nextInt(0, COLOR_COUNT - 1)) % COLOR_COUNT;
        const result: FallingBlock[] = [];
        for (let i = 0; i < count; i++) {
          const color = i % 2 === 0 ? c1 : this.prng.chance(0.5) ? c1 : c2;
          result.push(this.makeBlock(startLane + i, color, speed * 0.96));
        }
        return result;
      }

      case 'fullCircle': {
        const colorCount = sides === 3 ? 2 : this.prng.chance(0.55) ? 2 : 3;
        const baseColor = randColor();
        const palette: number[] = [];
        for (let i = 0; i < colorCount; i++) {
          palette.push((baseColor + i) % COLOR_COUNT);
        }
        const offset = randLane();
        const result: FallingBlock[] = [];
        for (let i = 0; i < sides; i++) {
          result.push(this.makeBlock(offset + i, palette[i % colorCount] ?? 0, speed * 0.92));
        }
        return result;
      }

      case 'spiral': {
        const lane = this.spiralIndex;
        this.spiralIndex = (this.spiralIndex + this.spiralDir + sides) % sides;
        return [this.makeBlock(lane, randColor(), speed * 0.95)];
      }
    }
  }
}
