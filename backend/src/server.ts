import 'dotenv/config';
import { buildApp } from './app.js';
import { createLeaderboardEngine } from './services/leaderboard.js';
import { createGameStore } from './services/store.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  const store = await createGameStore(process.env.DATABASE_URL);
  const leaderboard = await createLeaderboardEngine(process.env.REDIS_URL);

  const app = buildApp({ store, leaderboard, logger: true });

  const shutdown = async () => {
    await app.close();
    await store.close?.();
    await leaderboard.close?.();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(
      `HEXACORE backend running on ${HOST}:${PORT} (store=${store.modeLabel}, leaderboard=${leaderboard.engineLabel})`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
