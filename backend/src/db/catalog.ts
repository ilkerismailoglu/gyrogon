import type { Pool } from 'pg';

export interface ShopItemDef {
  code: string;
  name: string;
  subtitle: string;
  category: 'theme' | 'frame';
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
    code: 'cyberpunk',
    name: 'Tema 1 · Cyberpunk Neon',
    subtitle: 'Yüksek kontrastlı koyu neon altıgen çekirdeği',
    category: 'theme',
    price: 0,
    sortOrder: 1
  },
  {
    code: 'classic',
    name: 'Tema 2 · Açık Klasik',
    subtitle: 'Minimalist açık gri zemin & düz (flat) blok tasarımı',
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
  },
  {
    code: 'neon-cyan',
    name: 'Çerçeve · Neon Siber',
    subtitle: 'Avatarın için parlayan siber camgöbeği halka',
    category: 'frame',
    price: 120,
    sortOrder: 101
  },
  {
    code: 'solar-gold',
    name: 'Çerçeve · Altın Şampiyon',
    subtitle: 'Yıldızlı altın şampiyonluk çerçevesi',
    category: 'frame',
    price: 180,
    sortOrder: 102
  },
  {
    code: 'emerald-aura',
    name: 'Çerçeve · Zümrüt Aura',
    subtitle: 'Enerjik zümrüt neon çerçeve',
    category: 'frame',
    price: 220,
    sortOrder: 103
  },
  {
    code: 'crimson-vip',
    name: 'Çerçeve · Kızıl VIP',
    subtitle: 'Özel VIP rozetli kızıl-altın çerçeve',
    category: 'frame',
    price: 300,
    sortOrder: 104
  },
  {
    code: 'royal-prism',
    name: 'Çerçeve · Prizma Kraliyet',
    subtitle: 'Efsanevi mor-cyan prizma halesi',
    category: 'frame',
    price: 400,
    sortOrder: 105
  }
];

export const DEFAULT_THEME_ITEMS = DEFAULT_SHOP_ITEMS.filter((item) => item.category === 'theme');
export const DEFAULT_FRAME_ITEMS = DEFAULT_SHOP_ITEMS.filter((item) => item.category === 'frame');

/**
 * Syncs `shop_items` with `DEFAULT_SHOP_ITEMS` and safely migrates any
 * obsolete theme codes in `users`, `user_inventory`, and `admin_rewards`
 * to `'classic'` inside a single transaction.
 */
export async function syncShopCatalog(pool: Pool): Promise<void> {
  const validCodes = DEFAULT_SHOP_ITEMS.map((item) => item.code);
  const validThemeCodes = DEFAULT_THEME_ITEMS.map((item) => item.code);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of DEFAULT_SHOP_ITEMS) {
      await client.query(
        `INSERT INTO "shop_items" ("code", "name", "subtitle", "category", "price", "sort_order", "active")
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT ("code") DO UPDATE SET
           "name" = EXCLUDED."name",
           "subtitle" = EXCLUDED."subtitle",
           "category" = EXCLUDED."category",
           "price" = EXCLUDED."price",
           "sort_order" = EXCLUDED."sort_order",
           "active" = true`,
        [item.code, item.name, item.subtitle, item.category, item.price, item.sortOrder]
      );
    }

    await client.query(
      `UPDATE "users" SET "equipped_theme" = 'classic' WHERE NOT ("equipped_theme" = ANY($1::text[]))`,
      [validThemeCodes]
    );
    await client.query(
      `INSERT INTO "user_inventory" ("user_id", "item_code")
       SELECT DISTINCT "user_id", 'classic'
       FROM "user_inventory"
       WHERE NOT ("item_code" = ANY($1::text[]))
       ON CONFLICT ("user_id", "item_code") DO NOTHING`,
      [validCodes]
    );
    await client.query(
      `DELETE FROM "user_inventory" WHERE NOT ("item_code" = ANY($1::text[]))`,
      [validCodes]
    );
    await client.query(
      `UPDATE "admin_rewards"
       SET "theme_code" = 'classic'
       WHERE "theme_code" IS NOT NULL AND NOT ("theme_code" = ANY($1::text[]))`,
      [validCodes]
    );
    await client.query(
      `DELETE FROM "shop_items" WHERE NOT ("code" = ANY($1::text[]))`,
      [validCodes]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export const DAILY_QUEST_TEMPLATES: DailyQuestTemplate[] = [
  { questCode: 'q-blocks', title: '30 Blok Patlat', target: 30, rewardCoins: 40 },
  { questCode: 'q-combo', title: 'x4 Kombo Yakala', target: 4, rewardCoins: 50 },
  { questCode: 'q-score', title: '1.200 Puana Ulaş', target: 1200, rewardCoins: 75 }
];

/** 7-day login streak coin rewards (index 0 = Day 1 ... index 6 = Day 7). */
export const STREAK_REWARDS = [25, 40, 60, 80, 100, 125, 200] as const;

export const DEFAULT_AVATAR_URL = 'preset:pilot';
export const DEFAULT_AVATAR_FRAME = 'default';

export const PRESET_AVATAR_IDS = [
  'preset:pilot',
  'preset:capybara',
  'preset:cloud',
  'preset:fox',
  'preset:cat',
  'preset:unicorn',
  'preset:owl',
  'preset:panda',
  'preset:dragon',
  'preset:bot'
] as const;

export const AVATAR_FRAME_IDS = [
  'default',
  'neon-cyan',
  'solar-gold',
  'emerald-aura',
  'crimson-vip',
  'royal-prism'
] as const;

const AVATAR_DATA_URL_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

export function isValidAvatarUrl(val: string): boolean {
  if ((PRESET_AVATAR_IDS as readonly string[]).includes(val)) return true;
  if (val.length <= 120_000 && AVATAR_DATA_URL_RE.test(val)) return true;
  return false;
}

export function isValidAvatarFrame(val: string): boolean {
  return (AVATAR_FRAME_IDS as readonly string[]).includes(val);
}

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
