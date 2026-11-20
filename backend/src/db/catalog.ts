export interface ShopItemDef {
  code: string;
  name: string;
  subtitle: string;
  category: 'theme';
  price: number;
  sortOrder: number;
}

export interface DailyQuestTemplate {
  questCode: 'q-blocks' | 'q-combo' | 'q-score';
  title: string;
  target: number;
  rewardCoins: number;
}

export const DEFAULT_SHOP_ITEMS: ShopItemDef[] = [
  {
    code: 'hextris',
    name: 'Tema 1 · Hextris Klasik',
    subtitle: 'Orijinal 2014 Hextris düz (flat) minimalist tasarımı',
    category: 'theme',
    price: 0,
    sortOrder: 1
  },
  {
    code: 'cyberpunk',
    name: 'Tema 2 · Cyberpunk Neon',
    subtitle: 'Yüksek kontrastlı koyu neon altıgen çekirdeği',
    category: 'theme',
    price: 0,
    sortOrder: 2
  },
  {
    code: 'synthwave',
    name: 'Tema 3 · Synthwave Sunset',
    subtitle: '80s retro gün batımı mor & magenta tonları',
    category: 'theme',
    price: 80,
    sortOrder: 3
  },
  {
    code: 'monochrome',
    name: 'Tema 4 · Solar Contrast',
    subtitle: 'Ultra net turnuva görüşü için yüksek kontrast',
    category: 'theme',
    price: 120,
    sortOrder: 4
  },
  {
    code: 'matrix',
    name: 'Tema 5 · Matrix Overdrive',
    subtitle: 'Siber terminal yeşil & fosfor paleti',
    category: 'theme',
    price: 150,
    sortOrder: 5
  }
];

export const DAILY_QUEST_TEMPLATES: DailyQuestTemplate[] = [
  { questCode: 'q-blocks', title: '30 Blok Patlat', target: 30, rewardCoins: 40 },
  { questCode: 'q-combo', title: 'x4 Kombo Yakala', target: 4, rewardCoins: 50 },
  { questCode: 'q-score', title: '1.200 Puana Ulaş', target: 1200, rewardCoins: 75 }
];

/** 7-day login streak coin rewards (index 0 = Day 1 ... index 6 = Day 7). */
export const STREAK_REWARDS = [25, 40, 60, 80, 100, 125, 200] as const;

export function getUtcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getPreviousUtcDateString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** ISO week key in format YYYY-Www (e.g. 2026-W47) for weekly Redis ZSET leaderboards. */
export function getIsoWeekKey(date = new Date()): string {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
