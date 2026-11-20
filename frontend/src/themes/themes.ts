export type ThemeId = 'hextris' | 'cyberpunk' | 'synthwave' | 'monochrome' | 'matrix';

export interface BlockColorSpec {
  hex: string;
  glow: string;
  label: string;
}

export interface HexTheme {
  id: ThemeId;
  badge: string;
  name: string;
  subtitle: string;
  price: number;
  isLight: boolean;
  flatStyle: boolean;
  canvasBg: string;
  outerHexFill: string | null;
  outerHexStroke: string;
  coreFill: string;
  coreStroke: string | null;
  coreGlow: string;
  scoreTextColor: string;
  laneLine: string | null;
  dangerColor: string;
  palette: [BlockColorSpec, BlockColorSpec, BlockColorSpec, BlockColorSpec];
}

export const THEMES: Record<ThemeId, HexTheme> = {
  hextris: {
    id: 'hextris',
    badge: 'Tema 1 · Varsayılan',
    name: 'Hextris Klasik',
    subtitle: 'Orijinal Hextris açık gri zemin & düz (flat) blok tasarımı',
    price: 0,
    isLight: true,
    flatStyle: true,
    canvasBg: '#ecf0f1',
    outerHexFill: '#bdc3c7',
    outerHexStroke: 'rgba(44, 62, 80, 0.08)',
    coreFill: '#2c3e50',
    coreStroke: null,
    coreGlow: 'transparent',
    scoreTextColor: '#ecf0f1',
    laneLine: null,
    dangerColor: '#e74c3c',
    palette: [
      { hex: '#e74c3c', glow: 'transparent', label: 'Kırmızı' },
      { hex: '#f1c40f', glow: 'transparent', label: 'Sarı' },
      { hex: '#3498db', glow: 'transparent', label: 'Mavi' },
      { hex: '#2ecc71', glow: 'transparent', label: 'Yeşil' }
    ]
  },
  cyberpunk: {
    id: 'cyberpunk',
    badge: 'Tema 2',
    name: 'Cyberpunk Neon',
    subtitle: 'Yüksek kontrastlı koyu neon altıgen çekirdeği',
    price: 0,
    isLight: false,
    flatStyle: false,
    canvasBg: '#050811',
    outerHexFill: null,
    outerHexStroke: 'rgba(255, 255, 255, 0.14)',
    coreFill: '#0F172A',
    coreStroke: '#00F0FF',
    coreGlow: 'rgba(0, 240, 255, 0.5)',
    scoreTextColor: '#FFFFFF',
    laneLine: 'rgba(255, 255, 255, 0.05)',
    dangerColor: '#FF0055',
    palette: [
      { hex: '#00F0FF', glow: 'rgba(0, 240, 255, 0.55)', label: 'Cyan' },
      { hex: '#FF0055', glow: 'rgba(255, 0, 85, 0.55)', label: 'Pink' },
      { hex: '#FFB800', glow: 'rgba(255, 184, 0, 0.55)', label: 'Amber' },
      { hex: '#00FF87', glow: 'rgba(0, 255, 135, 0.55)', label: 'Emerald' }
    ]
  },
  synthwave: {
    id: 'synthwave',
    badge: 'Tema 3',
    name: 'Synthwave Sunset',
    subtitle: '80s retro gün batımı mor & magenta tonları',
    price: 80,
    isLight: false,
    flatStyle: false,
    canvasBg: '#0D061A',
    outerHexFill: null,
    outerHexStroke: 'rgba(255, 42, 133, 0.25)',
    coreFill: '#1B0B33',
    coreStroke: '#FF2A85',
    coreGlow: 'rgba(255, 42, 133, 0.55)',
    scoreTextColor: '#FFFFFF',
    laneLine: 'rgba(255, 110, 199, 0.07)',
    dangerColor: '#FF3B30',
    palette: [
      { hex: '#FF2A85', glow: 'rgba(255, 42, 133, 0.55)', label: 'Hot Pink' },
      { hex: '#FF9E00', glow: 'rgba(255, 158, 0, 0.55)', label: 'Sunset' },
      { hex: '#A855F7', glow: 'rgba(168, 85, 247, 0.55)', label: 'Violet' },
      { hex: '#22D3EE', glow: 'rgba(34, 211, 238, 0.55)', label: 'Laser' }
    ]
  },
  monochrome: {
    id: 'monochrome',
    badge: 'Tema 4',
    name: 'Solar Contrast',
    subtitle: 'Ultra net turnuva görüşü için yüksek kontrast',
    price: 120,
    isLight: false,
    flatStyle: false,
    canvasBg: '#090A0F',
    outerHexFill: null,
    outerHexStroke: 'rgba(255, 255, 255, 0.18)',
    coreFill: '#181A23',
    coreStroke: '#FFFFFF',
    coreGlow: 'rgba(255, 255, 255, 0.45)',
    scoreTextColor: '#FFFFFF',
    laneLine: 'rgba(255, 255, 255, 0.06)',
    dangerColor: '#FB7185',
    palette: [
      { hex: '#F8FAFC', glow: 'rgba(248, 250, 252, 0.45)', label: 'Titanium' },
      { hex: '#F59E0B', glow: 'rgba(245, 158, 11, 0.5)', label: 'Gold' },
      { hex: '#3B82F6', glow: 'rgba(59, 130, 246, 0.5)', label: 'Cobalt' },
      { hex: '#EF4444', glow: 'rgba(239, 68, 68, 0.5)', label: 'Crimson' }
    ]
  },
  matrix: {
    id: 'matrix',
    badge: 'Tema 5',
    name: 'Matrix Overdrive',
    subtitle: 'Siber terminal yeşil & fosfor paleti',
    price: 150,
    isLight: false,
    flatStyle: false,
    canvasBg: '#030B06',
    outerHexFill: null,
    outerHexStroke: 'rgba(0, 255, 102, 0.2)',
    coreFill: '#071B0E',
    coreStroke: '#00FF66',
    coreGlow: 'rgba(0, 255, 102, 0.55)',
    scoreTextColor: '#FFFFFF',
    laneLine: 'rgba(0, 255, 102, 0.06)',
    dangerColor: '#EF4444',
    palette: [
      { hex: '#00FF66', glow: 'rgba(0, 255, 102, 0.55)', label: 'Terminal' },
      { hex: '#38BDF8', glow: 'rgba(56, 189, 248, 0.55)', label: 'Ice' },
      { hex: '#FACC15', glow: 'rgba(250, 204, 21, 0.55)', label: 'Volt' },
      { hex: '#F43F5E', glow: 'rgba(244, 63, 94, 0.55)', label: 'Alert' }
    ]
  }
};
