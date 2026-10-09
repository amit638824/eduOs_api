import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool, query, ensureDatabaseExists, closeDatabase } from '../config/database.js';

const migrationsDir = path.resolve(process.cwd(), 'database/migrations');

const IGNORE_MYSQL_CODES = new Set([
  'ER_DUP_KEYNAME',
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_FIELDNAME',
  'ER_FK_DUP_NAME',
  'ER_MULTIPLE_PRI_KEY',
]);

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) =>
      part
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

async function migrate() {
  await ensureDatabaseExists();

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);

  const applied = await query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY id',
  );
  const appliedSet = new Set(applied.rows.map((r) => r.filename));

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
    const connection = await pool.getConnection();
    try {
      for (const statement of splitSqlStatements(sql)) {
        try {
          await connection.query(statement);
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code && IGNORE_MYSQL_CODES.has(code)) continue;
          throw error;
        }
      }
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`  apply ${file}`);
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }

  console.log('Migration complete.');
  await closeDatabase();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  if ((err as { code?: string }).code === 'ECONNREFUSED') {
    console.error(
      `\nMySQL is not running on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}.`,
      '\nStart MySQL 8, then set DB_USERNAME / DB_PASSWORD in eduOs_api/.env and run: npm run db:setup',
    );
  }
  process.exit(1);
});
