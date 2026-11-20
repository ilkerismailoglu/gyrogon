import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(connectionString?: string): Promise<void> {
  const url =
    connectionString ??
    process.env.DATABASE_URL ??
    'postgres://gyrogon:gyrogon_dev_pass@localhost:5432/gyrogon';

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');

  try {
    await migrate(db, { migrationsFolder });
    console.log(`[gyrogon-db] Migrations applied from ${migrationsFolder}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runMigrations().catch((err) => {
    console.error('[gyrogon-db] Migration failed:', err);
    process.exit(1);
  });
}
