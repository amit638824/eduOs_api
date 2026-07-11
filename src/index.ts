import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase, checkDatabaseConnection } from './config/database.js';

async function bootstrap() {
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    console.error('Failed to connect to PostgreSQL. Check your .env credentials.');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`EduTech API running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
