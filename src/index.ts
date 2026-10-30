import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase, checkDatabaseConnection, ensureDatabaseExists, query } from './config/database.js';
import { initRealtime } from './realtime/socket.js';

async function bootstrap() {
  try {
    await ensureDatabaseExists();
  } catch (err) {
    console.error('Failed to connect to MySQL. Check your .env credentials.', err);
    process.exit(1);
  }

  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    console.error('Failed to connect to MySQL database. Check DB_DATABASE, then run npm run migrate and npm run seed.');
    process.exit(1);
  }

  // Sync logo assets to email assets directories
  try {
    const srcLogo = path.resolve(process.cwd(), '..', 'eduOs_ui', 'public', 'img', 'logo', 'techwagger-logo.png');
    if (fs.existsSync(srcLogo)) {
      const targets = [
        path.join(process.cwd(), 'src', 'assets', 'email', 'techwagger-logo.png'),
        path.join(process.cwd(), 'dist', 'assets', 'email', 'techwagger-logo.png'),
      ];
      for (const t of targets) {
        fs.mkdirSync(path.dirname(t), { recursive: true });
        fs.copyFileSync(srcLogo, t);
      }
    }
  } catch (err) {
    console.warn('[bootstrap] Email assets sync warning:', err);
  }

  // Ensure organization branding is updated to Mindsprint in the database
  try {
    await query(`
      UPDATE organizations 
      SET name = 'Mindsprint', 
          slug = 'mindsprint', 
          logo_url = '/img/logo/techwagger-logo.png',
          updated_at = CURRENT_TIMESTAMP(3)
      WHERE name LIKE '%Edumatra%' 
         OR name LIKE '%Edumantra%' 
         OR name LIKE '%Super Computer%'
         OR name LIKE '%TechWagger%'
         OR slug LIKE '%eduma%'
         OR slug LIKE '%supercomputer%'
         OR slug LIKE '%techwagger%'
    `);
  } catch (err) {
    console.warn('[bootstrap] Organization branding sync notice:', err);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`Mindsprint API running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
  initRealtime(server);

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
