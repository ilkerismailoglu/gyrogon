import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDailySeed } from '@gyrogon/game-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DEFAULT_SHOP_ITEMS, getUtcDateString } from './catalog.js';
import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);

export async function runSeed(connectionString?: string): Promise<void> {
  const url =
    connectionString ??
    process.env.DATABASE_URL ??
    'postgres://gyrogon:gyrogon_dev_pass@localhost:5432/gyrogon';

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  try {
    for (const item of DEFAULT_SHOP_ITEMS) {
      await db
        .insert(schema.shopItems)
        .values({
          code: item.code,
          name: item.name,
          subtitle: item.subtitle,
          category: item.category,
          price: item.price,
          sortOrder: item.sortOrder,
          active: true
        })
        .onConflictDoNothing({ target: schema.shopItems.code });
    }

    // Seed daily seeds for today and next 7 days
    const now = new Date();
    for (let offset = 0; offset < 8; offset++) {
      const targetDate = new Date(now.getTime() + offset * 86400000);
      const dateStr = getUtcDateString(targetDate);
      await db
        .insert(schema.dailySeeds)
        .values({
          date: dateStr,
          seed: getDailySeed(dateStr),
          targetBronze: 500,
          targetSilver: 1500,
          targetGold: 3000
        })
        .onConflictDoNothing({ target: schema.dailySeeds.date });
    }

    console.log('[gyrogon-db] Seed completed (shop_items + 8 days of daily_seeds)');
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runSeed().catch((err) => {
    console.error('[gyrogon-db] Seed failed:', err);
    process.exit(1);
  });
}
