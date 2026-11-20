export const SUPPORTED_SIDES = [3, 4, 5, 6, 7, 8] as const;
export type PolygonSides = (typeof SUPPORTED_SIDES)[number];

export const SUPPORTED_LAYOUTS = ['polygon', 'bloom', 'morph'] as const;
export type BoardLayout = (typeof SUPPORTED_LAYOUTS)[number];
export const DEFAULT_LAYOUT: BoardLayout = 'polygon';

export function isSupportedLayout(value: unknown): value is BoardLayout {
  return typeof value === 'string' && (SUPPORTED_LAYOUTS as readonly string[]).includes(value);
}

export const DEFAULT_SIDES: PolygonSides = 6;
export const SIDES = 6;
export const MAX_ROWS = 13;
export const COLOR_COUNT = 4;
export const CORE_RADIUS = 54;
export const BLOCK_THICKNESS = 9;
export const SPAWN_RADIUS = 240;

export interface PolygonGeometry {
  sides: PolygonSides;
  coreRadius: number;
  blockThickness: number;
  maxRows: number;
  spawnRadius: number;
  stepAngle: number;
  cosHalf: number;
  dangerApothem: number;
  dangerVertexRadius: number;
}

const GEOMETRY_PRESETS: Record<
  PolygonSides,
  { coreRadius: number; blockThickness: number; maxRows: number; spawnRadius: number }
> = {
  3: { coreRadius: 42, blockThickness: 8, maxRows: 11, spawnRadius: 205 },
  4: { coreRadius: 50, blockThickness: 9, maxRows: 13, spawnRadius: 228 },
  5: { coreRadius: 52, blockThickness: 9, maxRows: 13, spawnRadius: 238 },
  6: { coreRadius: 54, blockThickness: 9, maxRows: 13, spawnRadius: 240 },
  7: { coreRadius: 56, blockThickness: 9, maxRows: 13, spawnRadius: 244 },
  8: { coreRadius: 58, blockThickness: 9, maxRows: 13, spawnRadius: 248 }
};

export function isSupportedSides(value: number): value is PolygonSides {
  return (SUPPORTED_SIDES as readonly number[]).includes(value);
}

export function getPolygonGeometry(sides: PolygonSides = DEFAULT_SIDES): PolygonGeometry {
  const preset = GEOMETRY_PRESETS[sides];
  const stepAngle = (Math.PI * 2) / sides;
  const cosHalf = Math.cos(Math.PI / sides);
  const dangerApothem = preset.coreRadius + preset.maxRows * preset.blockThickness;
  const dangerVertexRadius = dangerApothem / cosHalf;
  return {
    sides,
    ...preset,
    stepAngle,
    cosHalf,
    dangerApothem,
    dangerVertexRadius
  };
}

/** Fixed simulation frequency (60 ticks/sec) for deterministic replay and anti-cheat. */
export const LOGIC_TPS = 60;
export const TICK_DT = 1 / LOGIC_TPS;

/** Combo timeout in logic ticks (3.6 seconds at 60Hz). */
export const COMBO_DURATION_TICKS = 216;

/** Flash/shrink animation duration in ticks before deleted blocks vanish. */
export const DELETE_ANIM_TICKS = 9;

export type GameMode = 'classic' | 'daily';

export type GameStatus = 'READY' | 'PLAYING' | 'GAMEOVER';

export type BlockPowerUp = 'none' | 'bomb' | 'joker' | 'freeze';

export type MoveAction =
  | 'ROTATE_LEFT'
  | 'ROTATE_RIGHT'
  | 'FAST_DROP_ON'
  | 'FAST_DROP_OFF'
  | 'REVIVE';

export interface RecordedMove {
  tick: number;
  action: MoveAction;
}

export interface GridBlock {
  id: number;
  colorIndex: number;
  powerUp: BlockPowerUp;
  /** Radial apothem distance from center polygon */
  dist: number;
  /** Whether the block is resting on the core or the block underneath */
  settled: boolean;
  /** Downward radial speed while sliding into settled position */
  fallSpeed: number;
  /** Remaining ticks while flashing out; 0 = alive, > 0 = deleting */
  deleteTicks: number;
  /** Brief white impact highlight intensity (0..1) */
  tint: number;
  /** Needs BFS match evaluation on next pass */
  needsCheck: boolean;
}

export interface FallingBlock {
  id: number;
  lane: number;
  colorIndex: number;
  powerUp: BlockPowerUp;
  dist: number;
  speed: number;
}

export type WavePattern =
  | 'single'
  | 'double'
  | 'crosswise'
  | 'halfCircle'
  | 'fullCircle'
  | 'spiral';

export type EngineEvent =
  | { type: 'ROTATE'; tick: number; dir: -1 | 1; rotationSteps: number }
  | { type: 'LOCK'; tick: number; side: number; row: number; colorIndex: number; powerUp: BlockPowerUp }
  | {
      type: 'CLEAR';
      tick: number;
      cells: Array<{ side: number; row: number; colorIndex: number; powerUp: BlockPowerUp }>;
      gainedScore: number;
      gainedCoins: number;
      combo: number;
    }
  | { type: 'POWERUP'; tick: number; kind: Exclude<BlockPowerUp, 'none'>; side: number; row: number }
  | { type: 'COMBO_RESET'; tick: number }
  | { type: 'DANGER'; tick: number; maxStack: number }
  | { type: 'REVIVE'; tick: number; clearedBlocks: number }
  | { type: 'GAMEOVER'; tick: number; score: number };

export interface SimulatorSnapshot {
  tick: number;
  sides: PolygonSides;
  status: GameStatus;
  score: number;
  combo: number;
  comboTicksLeft: number;
  comboDurationTicks: number;
  lastClearedColor: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  revivesUsed: number;
  freezeTicksLeft: number;
  rotationSteps: number;
  fastDrop: boolean;
  difficulty: number;
  grid: GridBlock[][];
  fallingBlocks: FallingBlock[];
}

export interface ReplayVerificationResult {
  valid: boolean;
  simulatedScore: number;
  claimedScore: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  finalStatus: GameStatus;
  reason?: string;
}
