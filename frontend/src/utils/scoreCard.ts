import { PolygonSides } from '@gyrogon/game-core';
import { BlockColorSpec } from '../themes/themes';

export interface ScoreCardParams {
  score: number;
  maxCombo: number;
  blocksCleared: number;
  sides: PolygonSides;
  modeLabel: string;
  polygonLabel: string;
  layoutLabel?: string;
  playerName: string;
  comboLabel: string;
  blocksLabel: string;
  newRecordLabel?: string;
  isLight: boolean;
  palette: [BlockColorSpec, BlockColorSpec, BlockColorSpec, BlockColorSpec];
  locale: string;
}

export async function generateScoreCardBlob(params: ScoreCardParams): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { isLight, palette, sides } = params;
  const accent = isLight ? '#2c3e50' : palette[0].hex;

  // 1. Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  if (isLight) {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#e6ecf0');
  } else {
    grad.addColorStop(0, '#0b1224');
    grad.addColorStop(0.55, '#070b18');
    grad.addColorStop(1, '#04060e');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle background grid
  ctx.strokeStyle = isLight ? 'rgba(44, 62, 80, 0.05)' : 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= size; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Outer sleek frame
  ctx.strokeStyle = isLight ? 'rgba(44, 62, 80, 0.14)' : 'rgba(0, 240, 255, 0.22)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(44, 44, size - 88, size - 88, 56);
  ctx.stroke();

  // 2. GYROGON Title Top
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 54px "Space Grotesk", "Inter", system-ui, sans-serif';
  const gyroW = ctx.measureText('GYRO').width;
  const gonW = ctx.measureText('GON').width;
  const totalBrandW = gyroW + gonW;
  const startX = size / 2 - totalBrandW / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = isLight ? '#2c3e50' : '#f8fafc';
  ctx.fillText('GYRO', startX, 118);
  ctx.fillStyle = isLight ? '#3498db' : '#00f0ff';
  ctx.fillText('GON', startX + gyroW, 118);

  // 3. Center Geometric Polygon Emblem
  const cx = size / 2;
  const cy = 335;
  const rings = [140, 102, 66];
  const step = (Math.PI * 2) / sides;
  rings.forEach((r, ringIdx) => {
    for (let s = 0; s < sides; s++) {
      const a0 = s * step - Math.PI / 2 - step / 2;
      const a1 = (s + 1) * step - Math.PI / 2 - step / 2;
      const x0 = cx + Math.cos(a0) * r;
      const y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      const color = palette[(s + ringIdx) % palette.length]!.hex;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineWidth = ringIdx === 0 ? 16 : 12;
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      if (!isLight) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
      }
      ctx.stroke();
      ctx.restore();
    }
  });

  // Mode / Polygon Pill
  const tagText = `${params.modeLabel} · ${params.polygonLabel}${params.layoutLabel ? ` · ${params.layoutLabel}` : ''}`;
  ctx.font = '700 28px "Inter", system-ui, sans-serif';
  const tagW = ctx.measureText(tagText).width + 54;
  ctx.fillStyle = isLight ? 'rgba(44, 62, 80, 0.08)' : 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.roundRect(cx - tagW / 2, 506, tagW, 52, 26);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = isLight ? '#2c3e50' : '#e2e8f0';
  ctx.fillText(tagText, cx, 533);

  // Optional New Record Ribbon
  if (params.newRecordLabel) {
    ctx.font = '800 24px "Space Grotesk", "Inter", system-ui, sans-serif';
    const recW = ctx.measureText(params.newRecordLabel).width + 44;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(cx - recW / 2, 166, recW, 42, 21);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(params.newRecordLabel, cx, 188);
  }

  // 4. Giant Hero Score
  ctx.font = '800 132px "Space Grotesk", "Inter", system-ui, sans-serif';
  ctx.fillStyle = isLight ? '#2c3e50' : '#ffffff';
  ctx.fillText(params.score.toLocaleString(params.locale), cx, 646);

  // 5. Three Metric Boxes
  const boxes = [
    { label: params.comboLabel.toUpperCase(), value: `x${params.maxCombo}`, color: '#f59e0b' },
    { label: params.blocksLabel.toUpperCase(), value: String(params.blocksCleared), color: '#0ea5e9' },
    { label: 'GYROPILOT', value: params.playerName.slice(0, 14), color: accent }
  ];
  const cardW = 286;
  const cardH = 148;
  const gap = 28;
  const startCardX = cx - (cardW * 3 + gap * 2) / 2;

  boxes.forEach((box, idx) => {
    const bx = startCardX + idx * (cardW + gap);
    const by = 758;
    ctx.fillStyle = isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = isLight ? 'rgba(44, 62, 80, 0.14)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, cardW, cardH, 28);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '700 22px "Inter", system-ui, sans-serif';
    ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
    ctx.fillText(box.label, bx + cardW / 2, by + 46);

    ctx.font = '800 40px "Space Grotesk", "Inter", system-ui, sans-serif';
    ctx.fillStyle = box.color;
    ctx.fillText(box.value, bx + cardW / 2, by + 100);
  });

  // 6. Footer URL
  ctx.textAlign = 'center';
  ctx.font = '700 28px "Inter", system-ui, sans-serif';
  ctx.fillStyle = isLight ? '#64748b' : '#64748b';
  ctx.fillText('gyrogon.com', cx, 980);

  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
