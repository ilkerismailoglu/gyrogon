import {
  BlockPowerUp,
  BoardLayout,
  EngineEvent,
  GyrogonSimulator,
  PolygonGeometry,
  PolygonSides,
  TICK_DT,
  getPolygonGeometry
} from '@gyrogon/game-core';
import React, { useEffect, useRef } from 'react';
import { synthAudio } from '../audio/SynthAudioEngine';
import { HexTheme } from '../themes/themes';

export type ActivePowerUpKind = Exclude<BlockPowerUp, 'none'>;

export interface PowerUpHint {
  kind: ActivePowerUpKind;
  state: 'incoming' | 'activated';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
}

export interface HudUpdatePayload {
  score: number;
  combo: number;
  comboRatio: number;
  maxCombo: number;
  blocksCleared: number;
  coinsEarned: number;
  freezeSecondsLeft: number;
  danger: boolean;
  powerUpHint?: PowerUpHint;
  morphPhase?: 'polygon' | 'bloom';
  morphCountdown?: number;
  morphNextTarget?: 'polygon' | 'bloom';
}

interface GyrogonCanvasViewProps {
  simulator: GyrogonSimulator | null;
  sides: PolygonSides;
  layout: BoardLayout;
  isMenu: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  theme: HexTheme;
  onStartFromCenter: () => void;
  onRotate: (dir: -1 | 1) => void;
  onFastDropChange: (active: boolean) => void;
  onHudUpdate: (hud: HudUpdatePayload) => void;
  onGameOver: () => void;
}

interface ChainSegment {
  p0x: number;
  p0y: number;
  p1x: number;
  p1y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  tangentAngle: number;
  normalAngle: number;
}

interface ChainState {
  joints: Array<{ x: number; y: number }>;
  segments: ChainSegment[];
  outwardDirs: Array<{ lx: number; ly: number; rx: number; ry: number }>;
  segLen: number;
  flatBaseY: number;
  dangerHeightPx: number;
  blockScale: number;
  mapHeightToPx: (hUnits: number) => number;
}

/**
 * Picks the cleanest vertical symmetry orientation for classic closed polygon mode:
 * - 4-gon (Square) & 8-gon (Octagon): flat horizontal/vertical edges
 * - 3, 5, 6, 7-gon: centered top vertex for classic pyramid symmetry
 */
function getBaseOrientationOffset(sides: PolygonSides, stepAngle: number): number {
  if (sides === 4 || sides === 8) {
    return 0;
  }
  return -Math.PI / 2 + stepAngle / 2;
}

/**
 * Computes canvas scaleFactor from logical units to CSS pixels.
 * - Desktop & landscape (w >= 640 || w >= h): original 41% of minDim (unchanged).
 * - Portrait mobile (w < 640 && h > w): trims side gutters so the outer polygon fills
 *   ~89–92% of the phone width while keeping safe top/bottom clearance for HUD & touch controls.
 */
function computeBoardScale(
  w: number,
  h: number,
  geo: PolygonGeometry,
  baseOffset: number
): number {
  const minDim = Math.min(w, h);
  if (w >= 640 || w >= h) {
    return (minDim * 0.41) / geo.dangerVertexRadius;
  }

  let restMaxX = 0;
  let restMaxY = 0;
  for (let s = 0; s < geo.sides; s++) {
    const va = s * geo.stepAngle - geo.stepAngle / 2 + baseOffset;
    const ax = Math.abs(Math.cos(va));
    const ay = Math.abs(Math.sin(va));
    if (ax > restMaxX) restMaxX = ax;
    if (ay > restMaxY) restMaxY = ay;
  }

  const targetByWidth = (w * 0.46) / (geo.dangerVertexRadius * Math.max(0.7, restMaxX));
  const capBySpinWidth = (w * 0.515) / geo.dangerVertexRadius;
  const capByHeight = (h * 0.315) / (geo.dangerVertexRadius * Math.max(0.7, restMaxY));

  return Math.min(targetByWidth, capBySpinWidth, capByHeight);
}

/**
 * Computes the articulated TOP-OPENING flower-bloom petal chain for any unfold progress u in [0, 1]:
 * - u = 0: Exact closed regular N-gon centered at (cx, cy), anchored at the bottom stem
 * - 0 < u < 1: The TOP apex splits open and left/right petals swing outward & downward like a blooming flower
 * - u = 1: Perfectly straight full-width N-segment horizontal bar near the bottom of the screen
 */
function computeChainState(
  w: number,
  h: number,
  cx: number,
  cy: number,
  scaleFactor: number,
  geo: PolygonGeometry,
  u: number
): ChainState {
  const N = geo.sides;
  const minDim = Math.min(w, h);
  const bendStep = geo.stepAngle * (1 - u);
  const halfBend = bendStep / 2;
  const cosHalfB = Math.cos(halfBend);

  const segLenClosed = 2 * geo.coreRadius * Math.tan(Math.PI / N) * scaleFactor;
  // Full viewport width when completely bloomed into the horizontal bar
  const segLenFlat = w / N;
  const segLen = segLenClosed + (segLenFlat - segLenClosed) * u;

  // Bottom stem anchor: bottom apex for even N, bottom flat edge midpoint for odd N
  const anchorYClosed =
    cy + (N % 2 === 0 ? geo.coreRadius / geo.cosHalf : geo.coreRadius) * scaleFactor;
  const flatBaseY = Math.min(h - Math.max(116, h * 0.155), cy + minDim * 0.34);
  const anchorY = anchorYClosed + (flatBaseY - anchorYClosed) * u;

  const joints: Array<{ x: number; y: number }> = Array.from({ length: N + 1 }, () => ({
    x: cx,
    y: anchorY
  }));

  // Negative sign curves petals UPWARD from the bottom stem so the TOP apex splits open!
  const tangentAngles: number[] = [];
  for (let k = 0; k < N; k++) {
    tangentAngles.push(-(k - (N - 1) / 2) * bendStep);
  }

  if (N % 2 === 0) {
    const mid = N / 2;
    joints[mid] = { x: cx, y: anchorY };
    for (let k = mid; k < N; k++) {
      const a = tangentAngles[k]!;
      const prev = joints[k]!;
      joints[k + 1] = {
        x: prev.x + segLen * Math.cos(a),
        y: prev.y + segLen * Math.sin(a)
      };
    }
    for (let k = mid - 1; k >= 0; k--) {
      const a = tangentAngles[k]!;
      const next = joints[k + 1]!;
      joints[k] = {
        x: next.x - segLen * Math.cos(a),
        y: next.y - segLen * Math.sin(a)
      };
    }
  } else {
    const mid = Math.floor(N / 2);
    joints[mid] = { x: cx - segLen / 2, y: anchorY };
    joints[mid + 1] = { x: cx + segLen / 2, y: anchorY };
    for (let k = mid + 1; k < N; k++) {
      const a = tangentAngles[k]!;
      const prev = joints[k]!;
      joints[k + 1] = {
        x: prev.x + segLen * Math.cos(a),
        y: prev.y + segLen * Math.sin(a)
      };
    }
    for (let k = mid - 1; k >= 0; k--) {
      const a = tangentAngles[k]!;
      const next = joints[k + 1]!;
      joints[k] = {
        x: next.x - segLen * Math.cos(a),
        y: next.y - segLen * Math.sin(a)
      };
    }
  }

  // Smooth 3D petal flip at u = 0.5:
  // u < 0.5 -> blocks sit on outer face of closing bud (+PI/2)
  // u >= 0.5 -> blocks rise upward from the open flower face (-PI/2)
  const blockSideSign = u < 0.5 ? 1 : -1;
  const blockScale = u <= 0.001 || u >= 0.999 ? 1 : Math.pow(Math.abs(Math.cos(u * Math.PI)), 0.65);

  const segments: ChainSegment[] = [];
  const outwardDirs: Array<{ lx: number; ly: number; rx: number; ry: number }> = [];
  for (let k = 0; k < N; k++) {
    const p0 = joints[k]!;
    const p1 = joints[k + 1]!;
    const tangentAngle = tangentAngles[k]!;
    const normalAngle = tangentAngle + blockSideSign * (Math.PI / 2);
    const outAngle = tangentAngle + Math.PI / 2;

    const tx = Math.cos(tangentAngle);
    const ty = Math.sin(tangentAngle);
    const nx = Math.cos(normalAngle);
    const ny = Math.sin(normalAngle);
    const lx = Math.cos(normalAngle + halfBend) / cosHalfB;
    const ly = Math.sin(normalAngle + halfBend) / cosHalfB;
    const rx = Math.cos(normalAngle - halfBend) / cosHalfB;
    const ry = Math.sin(normalAngle - halfBend) / cosHalfB;

    segments.push({
      p0x: p0.x,
      p0y: p0.y,
      p1x: p1.x,
      p1y: p1.y,
      tx,
      ty,
      nx,
      ny,
      lx,
      ly,
      rx,
      ry,
      tangentAngle,
      normalAngle
    });
    outwardDirs.push({
      lx: Math.cos(outAngle + halfBend) / cosHalfB,
      ly: Math.sin(outAngle + halfBend) / cosHalfB,
      rx: Math.cos(outAngle - halfBend) / cosHalfB,
      ry: Math.sin(outAngle - halfBend) / cosHalfB
    });
  }

  const dangerHeight = geo.maxRows * geo.blockThickness;
  const dangerHeightPx = dangerHeight * scaleFactor * blockScale;
  const mapHeightToPx = (hUnits: number): number => {
    const basePx =
      hUnits <= dangerHeight
        ? hUnits * scaleFactor
        : dangerHeight * scaleFactor + (hUnits - dangerHeight) * scaleFactor * (1 + u * 1.45);
    return basePx * blockScale;
  };

  return {
    joints,
    segments,
    outwardDirs,
    segLen,
    flatBaseY,
    dangerHeightPx,
    blockScale,
    mapHeightToPx
  };
}

export const GyrogonCanvasView: React.FC<GyrogonCanvasViewProps> = ({
  simulator,
  sides,
  layout,
  isMenu,
  isPlaying,
  isPaused,
  theme,
  onStartFromCenter,
  onRotate,
  onFastDropChange,
  onHudUpdate,
  onGameOver
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const activatedPowerUpRef = useRef<{ kind: ActivePowerUpKind; expiresAt: number } | null>(null);

  // Smooth 120Hz visual interpolation state
  const visualRef = useRef({
    angle: 0,
    targetAngle: 0,
    prevRotationSteps: 0,
    coreScale: 1,
    recoilX: 0,
    recoilY: 0,
    accumulator: 0,
    lastTime: 0,
    dangerPulsePhase: 0,
    unfold: layout === 'bloom' ? 1 : 0,
    targetUnfold: layout === 'bloom' ? 1 : 0
  });

  // Dynamic Morph mode phase scheduler
  const morphRef = useRef({
    isUnfolded: false,
    nextSwitchTick: 780,
    lastComboBoostTick: -999
  });

  // Pointer gesture tracking (tap left/right + swipe down fast-drop)
  const gestureRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    swipeDropTriggered: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    swipeDropTriggered: false
  });

  useEffect(() => {
    particlesRef.current = [];
    floatingTextsRef.current = [];
    activatedPowerUpRef.current = null;
    visualRef.current.angle = 0;
    visualRef.current.targetAngle = 0;
    visualRef.current.prevRotationSteps = simulator?.rotationSteps ?? 0;
    visualRef.current.coreScale = 1;
    visualRef.current.recoilX = 0;
    visualRef.current.recoilY = 0;
    visualRef.current.accumulator = 0;
    visualRef.current.lastTime = performance.now();
    morphRef.current = {
      isUnfolded: false,
      nextSwitchTick: 780,
      lastComboBoostTick: -999
    };
  }, [simulator, sides]);

  // Animate targetUnfold smoothly whenever layout changes in MENU or at game start
  useEffect(() => {
    if (layout === 'bloom') {
      visualRef.current.targetUnfold = 1;
    } else if (layout === 'polygon') {
      visualRef.current.targetUnfold = 0;
    } else if (isMenu) {
      visualRef.current.targetUnfold = 0;
    }
  }, [layout, isMenu]);

  const callbacksRef = useRef({
    onHudUpdate,
    onGameOver,
    theme,
    sides,
    layout,
    isMenu,
    isPlaying,
    isPaused
  });
  callbacksRef.current = { onHudUpdate, onGameOver, theme, sides, layout, isMenu, isPlaying, isPaused };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    visualRef.current.lastTime = performance.now();

    const spawnParticlesAtPoint = (
      px: number,
      py: number,
      scaleFactor: number,
      colorHex: string,
      count: number
    ) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = (55 + Math.random() * 145) * scaleFactor;
        particlesRef.current.push({
          x: px,
          y: py,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          color: colorHex,
          alpha: 1,
          size: (2.4 + Math.random() * 3.2) * scaleFactor
        });
      }
    };

    const getCellScreenPos = (
      w: number,
      h: number,
      scaleFactor: number,
      geo: PolygonGeometry,
      activeLayout: BoardLayout,
      side: number,
      row: number
    ): { x: number; y: number; nx: number; ny: number } => {
      const u = visualRef.current.unfold;
      const cx = w / 2;
      const cy = h / 2;

      if (activeLayout === 'polygon' && u < 0.001) {
        const baseOffset = getBaseOrientationOffset(geo.sides, geo.stepAngle);
        const worldAngle = baseOffset + side * geo.stepAngle + visualRef.current.angle;
        const radius = (geo.coreRadius + (row + 0.5) * geo.blockThickness) * scaleFactor;
        return {
          x: cx + Math.cos(worldAngle) * radius,
          y: cy + Math.sin(worldAngle) * radius,
          nx: Math.cos(worldAngle),
          ny: Math.sin(worldAngle)
        };
      }

      const chain = computeChainState(w, h, cx, cy, scaleFactor, geo, u);
      const visualStep = visualRef.current.angle / geo.stepAngle;
      const intStep = ((Math.round(visualStep) % geo.sides) + geo.sides) % geo.sides;
      const slot = (side + intStep) % geo.sides;
      const seg = chain.segments[slot]!;
      const midPx = chain.mapHeightToPx((row + 0.5) * geo.blockThickness);
      const mx = (seg.p0x + seg.p1x) / 2;
      const my = (seg.p0y + seg.p1y) / 2;
      return {
        x: mx + seg.nx * midPx,
        y: my + seg.ny * midPx,
        nx: seg.nx,
        ny: seg.ny
      };
    };

    const handleEvents = (
      events: EngineEvent[],
      w: number,
      h: number,
      scaleFactor: number,
      activeSides: PolygonSides,
      activeLayout: BoardLayout,
      activeTheme: HexTheme
    ) => {
      const geo = getPolygonGeometry(activeSides);
      const u = visualRef.current.unfold;
      const cx = w / 2;
      const cy = h / 2;
      const textBaseY = u > 0.5 ? h * 0.42 : cy - 48 * scaleFactor;

      for (const ev of events) {
        switch (ev.type) {
          case 'LOCK': {
            const pos = getCellScreenPos(w, h, scaleFactor, geo, activeLayout, ev.side, ev.row);
            visualRef.current.recoilX -= pos.nx * 3.2;
            visualRef.current.recoilY -= pos.ny * 3.2;
            synthAudio.play('lock');
            break;
          }
          case 'CLEAR': {
            visualRef.current.coreScale = 1.12;
            synthAudio.play('clear', ev.combo);
            synthAudio.vibrate([12, 24, 16]);

            const pCount = activeTheme.flatStyle ? 5 : 9;
            for (const cell of ev.cells) {
              const colorHex = activeTheme.palette[cell.colorIndex]?.hex ?? '#FFFFFF';
              const pos = getCellScreenPos(w, h, scaleFactor, geo, activeLayout, cell.side, cell.row);
              spawnParticlesAtPoint(pos.x, pos.y, scaleFactor, colorHex, pCount);
            }

            const firstColor = activeTheme.palette[ev.cells[0]?.colorIndex ?? 0]?.hex ?? '#2c3e50';
            const labelColor = activeTheme.flatStyle
              ? firstColor
              : ev.combo > 1
                ? '#00FF87'
                : firstColor;
            floatingTextsRef.current.push({
              x: cx,
              y: textBaseY,
              text: `+${ev.gainedScore}${ev.combo > 1 ? ` (x${ev.combo})` : ''}`,
              color: labelColor,
              alpha: 1
            });
            break;
          }
          case 'POWERUP': {
            synthAudio.play(ev.kind);
            synthAudio.vibrate([20, 20, 25]);
            activatedPowerUpRef.current = {
              kind: ev.kind,
              expiresAt: performance.now() + 2000
            };
            const powerLabel =
              ev.kind === 'bomb'
                ? 'BOMBA!'
                : ev.kind === 'joker'
                  ? 'JOKER ★'
                  : 'DONDURMA ❄';
            floatingTextsRef.current.push({
              x: cx,
              y: textBaseY - 26 * scaleFactor,
              text: powerLabel,
              color: activeTheme.flatStyle ? '#2c3e50' : '#FFB800',
              alpha: 1
            });
            break;
          }
          case 'DANGER': {
            synthAudio.play('danger');
            break;
          }
          case 'GAMEOVER': {
            synthAudio.play('gameover');
            synthAudio.vibrate([40, 30, 60]);
            callbacksRef.current.onGameOver();
            break;
          }
        }
      }
    };

    const drawPowerUpDecor = (
      ix: number,
      iy: number,
      thicknessPx: number,
      powerUp: BlockPowerUp,
      flatStyle: boolean
    ) => {
      if (powerUp === 'none') return;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = flatStyle ? '#ffffff' : '#070A12';
      ctx.font = `700 ${Math.max(10, Math.round(thicknessPx * 0.72))}px "Exo 2", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const symbol = powerUp === 'bomb' ? 'B' : powerUp === 'joker' ? '★' : '❄';
      ctx.fillText(symbol, ix, iy);
    };

    const drawTrapezoid = (
      cx: number,
      cy: number,
      centerAngle: number,
      innerApothem: number,
      outerApothem: number,
      activeSides: PolygonSides,
      cosHalf: number,
      fill: string,
      glow: string,
      flatStyle: boolean,
      powerUp: BlockPowerUp,
      tint: number,
      alpha: number
    ) => {
      const angularGap = flatStyle ? 0.002 : 0.008;
      const halfWedge = Math.PI / activeSides - angularGap;
      const a1 = centerAngle - halfWedge;
      const a2 = centerAngle + halfWedge;
      const innerR = innerApothem / cosHalf;
      const outerR = outerApothem / cosHalf;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * innerR, cy + Math.sin(a1) * innerR);
      ctx.lineTo(cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR);
      ctx.lineTo(cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR);
      ctx.lineTo(cx + Math.cos(a2) * innerR, cy + Math.sin(a2) * innerR);
      ctx.closePath();

      ctx.fillStyle = fill;
      if (!flatStyle) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = 11;
      }
      ctx.fill();

      if (tint > 0.02) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, tint * 0.6)})`;
        ctx.fill();
      }

      if (powerUp !== 'none') {
        const midR = (innerApothem + outerApothem) / 2;
        const ix = cx + Math.cos(centerAngle) * midR;
        const iy = cy + Math.sin(centerAngle) * midR;
        drawPowerUpDecor(ix, iy, outerApothem - innerApothem, powerUp, flatStyle);
      }

      ctx.restore();
    };

    const drawChainBlock = (
      seg: ChainSegment,
      dInner: number,
      dOuter: number,
      tangentShiftPx: number,
      fill: string,
      glow: string,
      flatStyle: boolean,
      powerUp: BlockPowerUp,
      tint: number,
      alpha: number
    ) => {
      const sideGap = flatStyle ? 0.9 : 1.8;
      const q0x = seg.p0x + seg.tx * (sideGap + tangentShiftPx);
      const q0y = seg.p0y + seg.ty * (sideGap + tangentShiftPx);
      const q1x = seg.p1x + seg.tx * (-sideGap + tangentShiftPx);
      const q1y = seg.p1y + seg.ty * (-sideGap + tangentShiftPx);

      const x0 = q0x + seg.lx * dInner;
      const y0 = q0y + seg.ly * dInner;
      const x1 = q0x + seg.lx * dOuter;
      const y1 = q0y + seg.ly * dOuter;
      const x2 = q1x + seg.rx * dOuter;
      const y2 = q1y + seg.ry * dOuter;
      const x3 = q1x + seg.rx * dInner;
      const y3 = q1y + seg.ry * dInner;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();

      ctx.fillStyle = fill;
      if (!flatStyle) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = 11;
      }
      ctx.fill();

      if (tint > 0.02) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, tint * 0.6)})`;
        ctx.fill();
      }

      if (powerUp !== 'none') {
        const ix = (x0 + x1 + x2 + x3) / 4;
        const iy = (y0 + y1 + y2 + y3) / 4;
        drawPowerUpDecor(ix, iy, dOuter - dInner, powerUp, flatStyle);
      }

      ctx.restore();
    };

    const drawPolygon = (
      cx: number,
      cy: number,
      activeSides: PolygonSides,
      stepAngle: number,
      vertexRadius: number,
      rotationRad: number
    ) => {
      ctx.beginPath();
      for (let s = 0; s < activeSides; s++) {
        const va = s * stepAngle - stepAngle / 2 + rotationRad;
        const vx = cx + Math.cos(va) * vertexRadius;
        const vy = cy + Math.sin(va) * vertexRadius;
        if (s === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
    };

    const frame = (now: number) => {
      const dt = Math.min((now - visualRef.current.lastTime) / 1000, 0.08);
      visualRef.current.lastTime = now;

      const {
        theme: activeTheme,
        sides: propSides,
        layout: activeLayout,
        isMenu: menuMode,
        isPlaying: playing,
        isPaused: paused,
        onHudUpdate: emitHud
      } = callbacksRef.current;

      const activeSides: PolygonSides = simulator?.sides ?? propSides;
      const geo = getPolygonGeometry(activeSides);
      const baseOffset = getBaseOrientationOffset(activeSides, geo.stepAngle);

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const scaleFactor = computeBoardScale(w, h, geo, baseOffset);
      const cx = w / 2 + visualRef.current.recoilX;
      const cy = h / 2 + visualRef.current.recoilY;

      // Sync target angle cleanly with simulator rotationSteps (shortest modular path)
      if (simulator) {
        const curStep = simulator.rotationSteps;
        const prevStep = visualRef.current.prevRotationSteps;
        if (curStep !== prevStep) {
          let delta = curStep - prevStep;
          if (delta > activeSides / 2) delta -= activeSides;
          if (delta < -activeSides / 2) delta += activeSides;
          visualRef.current.targetAngle += delta * geo.stepAngle;
          visualRef.current.prevRotationSteps = curStep;
        }
      }

      // 60Hz Fixed-Tick Physics Stepping inside 120Hz RAF Loop
      let morphCountdown = 0;
      let morphNextTarget: 'polygon' | 'bloom' | undefined;
      if (simulator && playing && !paused && simulator.status === 'PLAYING') {
        visualRef.current.accumulator += dt;
        let steps = 0;
        while (visualRef.current.accumulator >= TICK_DT && steps < 5) {
          const events = simulator.stepTick();
          if (events.length > 0) {
            handleEvents(events, w, h, scaleFactor, activeSides, activeLayout, activeTheme);
          }

          // Dynamic Morph Mode: cycles between closed polygon & blooming flat line on waves/combos
          if (activeLayout === 'morph') {
            const ms = morphRef.current;
            if (
              simulator.combo >= 3 &&
              simulator.tick - ms.lastComboBoostTick > 360 &&
              ms.nextSwitchTick - simulator.tick > 150
            ) {
              ms.nextSwitchTick = simulator.tick + 120;
              ms.lastComboBoostTick = simulator.tick;
            }

            if (simulator.tick >= ms.nextSwitchTick) {
              ms.isUnfolded = !ms.isUnfolded;
              ms.nextSwitchTick = simulator.tick + 780;
              visualRef.current.targetUnfold = ms.isUnfolded ? 1 : 0;
              synthAudio.play(ms.isUnfolded ? 'bloom' : 'fold');
              synthAudio.vibrate([14, 26, 14]);
              floatingTextsRef.current.push({
                x: w / 2,
                y: h * 0.36,
                text: ms.isUnfolded ? '▤ DÜZLEM MODU!' : '⬡ ÇOKGEN MODU!',
                color: activeTheme.flatStyle ? '#2c3e50' : '#00F0FF',
                alpha: 1.25
              });
            }
          }

          visualRef.current.accumulator -= TICK_DT;
          steps += 1;
        }

        if (activeLayout === 'morph') {
          const ms = morphRef.current;
          const remaining = ms.nextSwitchTick - simulator.tick;
          if (remaining > 0 && remaining <= 120) {
            morphCountdown = Math.ceil(remaining / 60);
            morphNextTarget = ms.isUnfolded ? 'polygon' : 'bloom';
          }
        }

        const snap = simulator.getSnapshot();
        let maxStack = 0;
        for (const s of snap.grid) {
          const alive = s.filter((b) => b.deleteTicks === 0).length;
          if (alive > maxStack) maxStack = alive;
        }

        let powerUpHint: PowerUpHint | undefined;
        let closestDist = Number.POSITIVE_INFINITY;
        for (const fb of snap.fallingBlocks) {
          if (fb.powerUp !== 'none' && fb.dist < closestDist) {
            closestDist = fb.dist;
            powerUpHint = { kind: fb.powerUp, state: 'incoming' };
          }
        }
        if (!powerUpHint && activatedPowerUpRef.current) {
          if (performance.now() < activatedPowerUpRef.current.expiresAt) {
            powerUpHint = { kind: activatedPowerUpRef.current.kind, state: 'activated' };
          } else {
            activatedPowerUpRef.current = null;
          }
        }

        emitHud({
          score: snap.score,
          combo: snap.combo,
          comboRatio: snap.comboDurationTicks > 0 ? snap.comboTicksLeft / snap.comboDurationTicks : 0,
          maxCombo: snap.maxCombo,
          blocksCleared: snap.blocksCleared,
          coinsEarned: snap.coinsEarned,
          freezeSecondsLeft: Math.ceil(snap.freezeTicksLeft / 60),
          danger: maxStack >= geo.maxRows - 2,
          powerUpHint,
          morphPhase:
            activeLayout === 'morph' ? (morphRef.current.isUnfolded ? 'bloom' : 'polygon') : undefined,
          morphCountdown: morphCountdown > 0 ? morphCountdown : undefined,
          morphNextTarget
        });
      }

      // Smooth visual spring interpolation (including organic flower bloom/fold)
      const angleDiff = visualRef.current.targetAngle - visualRef.current.angle;
      visualRef.current.angle += angleDiff * Math.min(1, dt * 20);
      visualRef.current.coreScale += (1 - visualRef.current.coreScale) * Math.min(1, dt * 14);
      visualRef.current.recoilX += (0 - visualRef.current.recoilX) * Math.min(1, dt * 16);
      visualRef.current.recoilY += (0 - visualRef.current.recoilY) * Math.min(1, dt * 16);
      visualRef.current.dangerPulsePhase += dt * 6;

      const unfoldDiff = visualRef.current.targetUnfold - visualRef.current.unfold;
      if (Math.abs(unfoldDiff) < 0.001) {
        visualRef.current.unfold = visualRef.current.targetUnfold;
      } else {
        visualRef.current.unfold += unfoldDiff * Math.min(1, dt * 4.6);
      }
      const u = visualRef.current.unfold;

      // Update particles & floating texts
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        if (!p) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= dt * 2.2;
        if (p.alpha <= 0) particlesRef.current.splice(i, 1);
      }
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        if (!ft) continue;
        ft.y -= 36 * dt;
        ft.alpha -= dt * 1.15;
        if (ft.alpha <= 0) floatingTextsRef.current.splice(i, 1);
      }

      // ===================== RENDER =====================
      ctx.fillStyle = activeTheme.canvasBg;
      ctx.fillRect(0, 0, w, h);

      if (simulator && simulator.freezeTicksLeft > 0) {
        ctx.fillStyle = activeTheme.isLight
          ? 'rgba(52, 152, 219, 0.08)'
          : 'rgba(56, 189, 248, 0.07)';
        ctx.fillRect(0, 0, w, h);
      }

      const useClassicClosedRenderer = activeLayout === 'polygon' && u < 0.001;

      if (useClassicClosedRenderer) {
        // ============ CLASSIC CLOSED POLYGON RENDERER (100% original geometry) ============
        const dangerRadius = geo.dangerApothem * scaleFactor;
        const dangerVertexRadius = geo.dangerVertexRadius * scaleFactor;
        const outerRotation = activeTheme.flatStyle
          ? baseOffset
          : baseOffset + visualRef.current.angle;

        ctx.save();
        drawPolygon(w / 2, h / 2, activeSides, geo.stepAngle, dangerVertexRadius, outerRotation);
        if (activeTheme.outerHexFill) {
          ctx.fillStyle = menuMode ? '#dcdfe1' : activeTheme.outerHexFill;
          ctx.fill();
        } else {
          ctx.strokeStyle = activeTheme.outerHexStroke;
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();

        // Melting Combo Timer Perimeter
        if (simulator && simulator.combo > 1 && simulator.comboTicksLeft > 0) {
          const ratio = simulator.comboTicksLeft / 216;
          const comboColor =
            activeTheme.palette[simulator.lastClearedColor]?.hex ?? activeTheme.coreFill;
          const borderR = dangerVertexRadius + (activeTheme.flatStyle ? 0 : 4 * scaleFactor);
          const vertices: Array<[number, number]> = [];
          for (let s = 0; s <= activeSides; s++) {
            const va = s * geo.stepAngle - geo.stepAngle / 2 + outerRotation;
            vertices.push([w / 2 + Math.cos(va) * borderR, h / 2 + Math.sin(va) * borderR]);
          }

          const totalEdges = ratio * activeSides;
          ctx.save();
          ctx.strokeStyle = comboColor;
          if (!activeTheme.flatStyle) {
            ctx.shadowColor = comboColor;
            ctx.shadowBlur = 12;
          }
          ctx.lineWidth = (activeTheme.flatStyle ? 4.5 : 3.5) * scaleFactor;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i < activeSides; i++) {
            const edgeFraction = Math.max(0, Math.min(1, totalEdges - i));
            if (edgeFraction <= 0) break;
            const pA = vertices[i];
            const pB = vertices[i + 1];
            if (!pA || !pB) break;
            if (i === 0) ctx.moveTo(pA[0], pA[1]);
            ctx.lineTo(
              pA[0] + (pB[0] - pA[0]) * edgeFraction,
              pA[1] + (pB[1] - pA[1]) * edgeFraction
            );
          }
          ctx.stroke();
          ctx.restore();
        }

        // Optional Lane Guide Lines (Neon themes)
        if (activeTheme.laneLine) {
          const coreVertexR = (geo.coreRadius / geo.cosHalf) * scaleFactor;
          const spawnVertexR = (geo.spawnRadius / geo.cosHalf) * scaleFactor;
          for (let lane = 0; lane < activeSides; lane++) {
            const angle = baseOffset + lane * geo.stepAngle - geo.stepAngle / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * coreVertexR, cy + Math.sin(angle) * coreVertexR);
            ctx.lineTo(cx + Math.cos(angle) * spawnVertexR, cy + Math.sin(angle) * spawnVertexR);
            ctx.strokeStyle = activeTheme.laneLine;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        if (simulator) {
          const pulse = 0.1 + 0.1 * Math.sin(visualRef.current.dangerPulsePhase);
          for (let s = 0; s < activeSides; s++) {
            const stack = simulator.grid[s];
            if (!stack) continue;
            const activeCount = stack.filter((b) => b.deleteTicks === 0).length;
            if (activeCount >= geo.maxRows - 2) {
              const centerA = baseOffset + s * geo.stepAngle + visualRef.current.angle;
              drawTrapezoid(
                cx,
                cy,
                centerA,
                geo.coreRadius * scaleFactor,
                dangerRadius,
                activeSides,
                geo.cosHalf,
                activeTheme.dangerColor,
                activeTheme.dangerColor,
                activeTheme.flatStyle,
                'none',
                0,
                pulse
              );
            }
          }

          const radialGap = activeTheme.flatStyle ? 0.6 : 1.4;
          for (let s = 0; s < activeSides; s++) {
            const sideAngle = baseOffset + s * geo.stepAngle + visualRef.current.angle;
            const stack = simulator.grid[s];
            if (!stack) continue;

            for (const b of stack) {
              const innerR = (b.dist + radialGap) * scaleFactor;
              const outerR = (b.dist + geo.blockThickness) * scaleFactor;
              const spec = activeTheme.palette[b.colorIndex] ?? activeTheme.palette[0];
              const isDeleting = b.deleteTicks > 0;
              const fill = isDeleting ? '#FFFFFF' : spec.hex;
              const alpha = isDeleting ? Math.max(0.15, b.deleteTicks / 9) : 1;

              drawTrapezoid(
                cx,
                cy,
                sideAngle,
                innerR,
                outerR,
                activeSides,
                geo.cosHalf,
                fill,
                spec.glow,
                activeTheme.flatStyle,
                b.powerUp,
                b.tint,
                alpha
              );
            }
          }

          for (const fb of simulator.fallingBlocks) {
            const laneAngle = baseOffset + fb.lane * geo.stepAngle;
            const innerR = (fb.dist + radialGap) * scaleFactor;
            const outerR = (fb.dist + geo.blockThickness) * scaleFactor;
            const spec = activeTheme.palette[fb.colorIndex] ?? activeTheme.palette[0];
            drawTrapezoid(
              cx,
              cy,
              laneAngle,
              innerR,
              outerR,
              activeSides,
              geo.cosHalf,
              spec.hex,
              spec.glow,
              activeTheme.flatStyle,
              fb.powerUp,
              0,
              1
            );
          }
        }

        // Central Polygon Core
        const strokeHalfWidth = activeTheme.coreStroke ? 1.5 : 0;
        const coreApothem =
          (geo.coreRadius - strokeHalfWidth) * scaleFactor * visualRef.current.coreScale;
        const scaledCore = coreApothem / geo.cosHalf;
        ctx.save();
        drawPolygon(
          cx,
          cy,
          activeSides,
          geo.stepAngle,
          scaledCore,
          baseOffset + visualRef.current.angle
        );
        ctx.fillStyle = activeTheme.coreFill;
        if (!activeTheme.flatStyle && activeTheme.coreStroke) {
          ctx.shadowColor = activeTheme.coreGlow;
          ctx.shadowBlur = 16;
        }
        ctx.fill();
        if (activeTheme.coreStroke) {
          ctx.strokeStyle = activeTheme.coreStroke;
          ctx.lineWidth = Math.max(2, 3 * scaleFactor);
          ctx.stroke();
        }
        ctx.restore();

        // Center Content: Play Triangle on MENU, Score while playing
        ctx.save();
        ctx.fillStyle = activeTheme.scoreTextColor;
        if (menuMode) {
          const triR = Math.min(20, geo.coreRadius * 0.42) * scaleFactor;
          ctx.beginPath();
          ctx.moveTo(cx - triR * 0.55, cy - triR * 0.85);
          ctx.lineTo(cx + triR * 1.05, cy);
          ctx.lineTo(cx - triR * 0.55, cy + triR * 0.85);
          ctx.closePath();
          ctx.fill();
        } else {
          const scoreText = String(simulator?.score ?? 0);
          const baseFont = scoreText.length >= 6 ? 20 : activeSides === 3 ? 22 : 28;
          ctx.font = `${activeTheme.flatStyle ? '400' : '700'} ${Math.max(15, Math.round(baseFont * scaleFactor))}px ${activeTheme.flatStyle ? '"Exo 2", sans-serif' : '"Space Grotesk", sans-serif'}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(scoreText, cx, cy);
        }
        ctx.restore();
      } else {
        // ============ ARTICULATED FLOWER-BLOOM / MORPH / FLAT-LINE RENDERER ============
        const chain = computeChainState(w, h, cx, cy, scaleFactor, geo, u);
        const visualStep = visualRef.current.angle / geo.stepAngle;
        const intStep = ((Math.round(visualStep) % activeSides) + activeSides) % activeSides;
        const fracStep = visualStep - Math.round(visualStep);
        const rotOffsetRad = u < 0.7 ? -(1 - u / 0.7) * fracStep * geo.stepAngle : 0;
        const slideBlend = Math.min(1, u / 0.7);
        const slidePx = slideBlend * fracStep * chain.segLen;
        const radialGap = activeTheme.flatStyle ? 0.6 : 1.4;

        // 1. Outer Danger Envelope (blooms open from TOP apex into crisp full-width horizontal playfield)
        const outerPts: Array<{ x: number; y: number }> = [];
        for (let k = 0; k < activeSides; k++) {
          const seg = chain.segments[k]!;
          if (k === 0) {
            outerPts.push({
              x: seg.p0x + seg.lx * chain.dangerHeightPx,
              y: seg.p0y + seg.ly * chain.dangerHeightPx
            });
          }
          outerPts.push({
            x: seg.p1x + seg.rx * chain.dangerHeightPx,
            y: seg.p1y + seg.ry * chain.dangerHeightPx
          });
        }

        if (chain.blockScale > 0.03) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(outerPts[0]!.x, outerPts[0]!.y);
          for (let i = 1; i < outerPts.length; i++) {
            ctx.lineTo(outerPts[i]!.x, outerPts[i]!.y);
          }
          if (u > 0.02) {
            for (let i = chain.joints.length - 1; i >= 0; i--) {
              ctx.lineTo(chain.joints[i]!.x, chain.joints[i]!.y);
            }
          }
          ctx.closePath();
          if (activeTheme.outerHexFill) {
            ctx.fillStyle = menuMode ? '#dcdfe1' : activeTheme.outerHexFill;
            ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.fill();
            ctx.strokeStyle = activeTheme.outerHexStroke;
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.restore();
        }

        // Top danger limit dashed line & vertical column guides rising out of the open blossom
        if (u > 0.52) {
          const guideAlpha = (u - 0.52) / 0.48;
          ctx.save();
          ctx.globalAlpha = guideAlpha * (activeTheme.flatStyle ? 0.2 : 0.26);
          ctx.strokeStyle = activeTheme.flatStyle ? '#2c3e50' : '#00F0FF';
          ctx.lineWidth = 1;
          for (let k = 0; k <= activeSides; k++) {
            const basePt = chain.joints[k]!;
            const topPt = outerPts[k]!;
            ctx.beginPath();
            ctx.moveTo(basePt.x, basePt.y);
            ctx.lineTo(topPt.x, topPt.y);
            ctx.stroke();
          }

          // Top danger ceiling line
          ctx.globalAlpha = guideAlpha * (activeTheme.flatStyle ? 0.35 : 0.45);
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(outerPts[0]!.x, outerPts[0]!.y);
          for (let i = 1; i < outerPts.length; i++) {
            ctx.lineTo(outerPts[i]!.x, outerPts[i]!.y);
          }
          ctx.stroke();
          ctx.restore();
        }

        // 2. Melting Combo Timer Perimeter (polygon ring when closed -> top bar when bloomed!)
        if (simulator && simulator.combo > 1 && simulator.comboTicksLeft > 0 && chain.blockScale > 0.04) {
          const ratio = simulator.comboTicksLeft / 216;
          const comboColor =
            activeTheme.palette[simulator.lastClearedColor]?.hex ?? activeTheme.coreFill;
          const totalEdges = ratio * activeSides;

          ctx.save();
          ctx.strokeStyle = comboColor;
          if (!activeTheme.flatStyle) {
            ctx.shadowColor = comboColor;
            ctx.shadowBlur = 12;
          }
          ctx.lineWidth = (activeTheme.flatStyle ? 4.5 : 3.5) * scaleFactor;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i < activeSides; i++) {
            const edgeFraction = Math.max(0, Math.min(1, totalEdges - i));
            if (edgeFraction <= 0) break;
            const pA = outerPts[i]!;
            const pB = outerPts[i + 1]!;
            if (i === 0) ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pA.x + (pB.x - pA.x) * edgeFraction, pA.y + (pB.y - pA.y) * edgeFraction);
          }
          ctx.stroke();
          ctx.restore();
        }

        if (simulator && chain.blockScale > 0.04) {
          // 3. Danger Pulse & Stacked Grid Blocks (with cyclic wrap carousel when flat!)
          const pulse = 0.1 + 0.1 * Math.sin(visualRef.current.dangerPulsePhase);
          ctx.save();

          if (u > 0.72) {
            // Clip horizontally to the flat bar span so cyclic wrap-around slides like a seamless conveyor
            const clipLeft = chain.joints[0]!.x;
            const clipRight = chain.joints[activeSides]!.x;
            ctx.beginPath();
            ctx.rect(clipLeft, 0, Math.max(1, clipRight - clipLeft), h);
            ctx.clip();
          } else if (Math.abs(rotOffsetRad) > 0.0001) {
            ctx.translate(cx, cy);
            ctx.rotate(rotOffsetRad);
            ctx.translate(-cx, -cy);
          }

          for (let s = 0; s < activeSides; s++) {
            const stack = simulator.grid[s];
            if (!stack) continue;
            const worldSlot = (s + intStep) % activeSides;
            const seg = chain.segments[worldSlot]!;

            const activeCount = stack.filter((b) => b.deleteTicks === 0).length;
            if (activeCount >= geo.maxRows - 2) {
              drawChainBlock(
                seg,
                0,
                chain.dangerHeightPx,
                slidePx,
                activeTheme.dangerColor,
                activeTheme.dangerColor,
                activeTheme.flatStyle,
                'none',
                0,
                pulse
              );
            }

            const drawStackOnSegment = (targetSeg: ChainSegment, shift: number) => {
              for (const b of stack) {
                const hInner = b.dist - geo.coreRadius + radialGap;
                const hOuter = b.dist - geo.coreRadius + geo.blockThickness;
                const dInner = chain.mapHeightToPx(hInner);
                const dOuter = chain.mapHeightToPx(hOuter);
                const spec = activeTheme.palette[b.colorIndex] ?? activeTheme.palette[0];
                const isDeleting = b.deleteTicks > 0;
                const fill = isDeleting ? '#FFFFFF' : spec.hex;
                const alpha = isDeleting ? Math.max(0.15, b.deleteTicks / 9) : 1;

                drawChainBlock(
                  targetSeg,
                  dInner,
                  dOuter,
                  shift,
                  fill,
                  spec.glow,
                  activeTheme.flatStyle,
                  b.powerUp,
                  b.tint,
                  alpha
                );
              }
            };

            drawStackOnSegment(seg, slidePx);

            // Seamless cyclic carousel twin at opposite end while sliding horizontally
            if (u > 0.72) {
              if (worldSlot === activeSides - 1 && fracStep > 0.005) {
                drawStackOnSegment(chain.segments[0]!, (fracStep - 1) * chain.segLen);
              } else if (worldSlot === 0 && fracStep < -0.005) {
                drawStackOnSegment(chain.segments[activeSides - 1]!, (fracStep + 1) * chain.segLen);
              }
            }
          }
          ctx.restore();

          // 4. Falling Blocks in World Lanes (unrotated sky lanes -> straight down when flat!)
          for (const fb of simulator.fallingBlocks) {
            const seg = chain.segments[fb.lane % activeSides]!;
            const hInner = fb.dist - geo.coreRadius + radialGap;
            const hOuter = fb.dist - geo.coreRadius + geo.blockThickness;
            const dInner = chain.mapHeightToPx(hInner);
            const dOuter = chain.mapHeightToPx(hOuter);
            const spec = activeTheme.palette[fb.colorIndex] ?? activeTheme.palette[0];

            drawChainBlock(
              seg,
              dInner,
              dOuter,
              0,
              spec.hex,
              spec.glow,
              activeTheme.flatStyle,
              fb.powerUp,
              0,
              1
            );
          }
        }

        // 5. Core Interior Fill (fades smoothly as petals open) + Articulated Base Petal Rail
        const interiorAlpha = Math.max(0, 1 - u * 1.35);
        if (interiorAlpha > 0.01) {
          ctx.save();
          if (u < 0.7 && Math.abs(rotOffsetRad) > 0.0001) {
            ctx.translate(cx, cy);
            ctx.rotate(rotOffsetRad);
            ctx.translate(-cx, -cy);
          }
          ctx.globalAlpha = interiorAlpha;
          ctx.beginPath();
          ctx.moveTo(chain.joints[0]!.x, chain.joints[0]!.y);
          for (let i = 1; i < chain.joints.length; i++) {
            ctx.lineTo(chain.joints[i]!.x, chain.joints[i]!.y);
          }
          ctx.closePath();
          ctx.fillStyle = activeTheme.coreFill;
          if (!activeTheme.flatStyle && activeTheme.coreStroke) {
            ctx.shadowColor = activeTheme.coreGlow;
            ctx.shadowBlur = 16;
          }
          ctx.fill();
          if (activeTheme.coreStroke) {
            ctx.strokeStyle = activeTheme.coreStroke;
            ctx.lineWidth = Math.max(2, 3 * scaleFactor);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Articulated Petal / Horizontal Base Rail
        const railAlpha = Math.min(1, u * 1.5);
        const railThickness = Math.max(12, 16 * scaleFactor);
        if (railAlpha > 0.01) {
          ctx.save();
          ctx.globalAlpha = railAlpha;
          ctx.beginPath();
          ctx.moveTo(chain.joints[0]!.x, chain.joints[0]!.y);
          for (let i = 1; i < chain.joints.length; i++) {
            ctx.lineTo(chain.joints[i]!.x, chain.joints[i]!.y);
          }
          for (let k = activeSides - 1; k >= 0; k--) {
            const seg = chain.segments[k]!;
            const out = chain.outwardDirs[k]!;
            if (k === activeSides - 1) {
              ctx.lineTo(seg.p1x + out.rx * railThickness, seg.p1y + out.ry * railThickness);
            }
            ctx.lineTo(seg.p0x + out.lx * railThickness, seg.p0y + out.ly * railThickness);
          }
          ctx.closePath();
          ctx.fillStyle = activeTheme.coreFill;
          if (!activeTheme.flatStyle && activeTheme.coreStroke) {
            ctx.shadowColor = activeTheme.coreGlow;
            ctx.shadowBlur = 14;
          }
          ctx.fill();
          if (activeTheme.coreStroke) {
            ctx.strokeStyle = activeTheme.coreStroke;
            ctx.lineWidth = Math.max(1.5, 2.2 * scaleFactor);
            ctx.stroke();
          }

          // Segment joint tick marks along the open rail
          ctx.shadowBlur = 0;
          ctx.strokeStyle = activeTheme.isLight
            ? 'rgba(236, 240, 241, 0.35)'
            : 'rgba(255, 255, 255, 0.22)';
          ctx.lineWidth = 1.5;
          for (let k = 1; k < activeSides; k++) {
            const seg = chain.segments[k]!;
            const out = chain.outwardDirs[k]!;
            ctx.beginPath();
            ctx.moveTo(seg.p0x, seg.p0y);
            ctx.lineTo(seg.p0x + out.lx * railThickness, seg.p0y + out.ly * railThickness);
            ctx.stroke();
          }

          // Subtle cyclic arrows tucked cleanly inside left/right ends of the full-width rail
          if (u > 0.7) {
            const arrowAlpha = (u - 0.7) / 0.3;
            ctx.globalAlpha = arrowAlpha * 0.75;
            ctx.fillStyle = activeTheme.scoreTextColor;
            ctx.font = `700 ${Math.max(12, Math.round(railThickness * 0.85))}px "Exo 2", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const leftCapX = chain.joints[0]!.x + 14;
            const rightCapX = chain.joints[activeSides]!.x - 14;
            const capY = chain.flatBaseY + railThickness * 0.5;
            ctx.fillText('‹', leftCapX, capY);
            ctx.fillText('›', rightCapX, capY);
          }
          ctx.restore();
        }

        // 6. Score / Center Play Symbol
        if (menuMode) {
          if (u < 0.5) {
            ctx.save();
            ctx.globalAlpha = 1 - u * 2;
            ctx.fillStyle = activeTheme.scoreTextColor;
            const triR = Math.min(20, geo.coreRadius * 0.42) * scaleFactor;
            ctx.beginPath();
            ctx.moveTo(cx - triR * 0.55, cy - triR * 0.85);
            ctx.lineTo(cx + triR * 1.05, cy);
            ctx.lineTo(cx - triR * 0.55, cy + triR * 0.85);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        } else {
          const scoreText = String(simulator?.score ?? 0);
          if (u < 0.5) {
            ctx.save();
            ctx.globalAlpha = 1 - u * 2;
            ctx.fillStyle = activeTheme.scoreTextColor;
            const baseFont = scoreText.length >= 6 ? 20 : activeSides === 3 ? 22 : 28;
            ctx.font = `${activeTheme.flatStyle ? '400' : '700'} ${Math.max(15, Math.round(baseFont * scaleFactor))}px ${activeTheme.flatStyle ? '"Exo 2", sans-serif' : '"Space Grotesk", sans-serif'}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(scoreText, cx, cy);
            ctx.restore();
          } else {
            // Centered sleek score badge anchored right onto the open horizontal rail
            const badgeAlpha = (u - 0.5) * 2;
            const badgeY = chain.flatBaseY + railThickness * 0.5 + 1;
            const fontSize = Math.max(15, Math.round(20 * scaleFactor));
            ctx.save();
            ctx.globalAlpha = badgeAlpha;
            ctx.font = `700 ${fontSize}px ${activeTheme.flatStyle ? '"Exo 2", sans-serif' : '"Space Grotesk", sans-serif'}`;
            const textW = ctx.measureText(scoreText).width;
            const pillW = Math.max(66, textW + 28);
            const pillH = Math.max(railThickness + 12, fontSize + 12);
            const pillX = cx - pillW / 2;
            const pillY = badgeY - pillH / 2;
            const r = pillH / 2;

            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, r);
            ctx.fillStyle = activeTheme.coreFill;
            ctx.fill();
            if (activeTheme.coreStroke) {
              ctx.strokeStyle = activeTheme.coreStroke;
              ctx.lineWidth = 2;
              ctx.stroke();
            }

            ctx.fillStyle = activeTheme.scoreTextColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(scoreText, cx, badgeY);
            ctx.restore();
          }
        }
      }

      // 7. Particles & Floating Texts
      for (const p of particlesRef.current) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const ft of floatingTextsRef.current) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, ft.alpha));
        ctx.fillStyle = ft.color;
        ctx.font = `700 ${Math.max(14, Math.round(18 * scaleFactor))}px "Exo 2", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [simulator]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    synthAudio.unlock();
    if (isMenu) {
      if (visualRef.current.unfold < 0.5) {
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const geo = getPolygonGeometry(sides);
        const baseOffset = getBaseOrientationOffset(sides, geo.stepAngle);
        const scaleFactor = computeBoardScale(rect.width, rect.height, geo, baseOffset);
        const hitRadius = (geo.coreRadius / geo.cosHalf) * scaleFactor * 1.25;
        if (Math.hypot(dx, dy) <= hitRadius) {
          onStartFromCenter();
        }
      }
      return;
    }

    if (!isPlaying || isPaused) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      swipeDropTriggered: false
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (g.pointerId !== e.pointerId || !isPlaying || isPaused) return;
    if (!g.swipeDropTriggered && e.clientY - g.startY > 28) {
      g.swipeDropTriggered = true;
      onFastDropChange(true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (g.pointerId !== e.pointerId) return;

    if (g.swipeDropTriggered) {
      onFastDropChange(false);
    } else if (isPlaying && !isPaused) {
      const rect = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      onRotate(localX < rect.width / 2 ? -1 : 1);
    }

    gestureRef.current.pointerId = null;
    gestureRef.current.swipeDropTriggered = false;
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="w-full h-full block touch-none cursor-pointer"
    />
  );
};
