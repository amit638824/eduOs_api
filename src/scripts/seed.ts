import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/database.js';
import { seedUsers } from './seed-users.js';

const seedDir = path.resolve(process.cwd(), 'database/seed');

async function seed() {
  const files = (await fs.readdir(seedDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(seedDir, file), 'utf-8');
    await pool.query(sql);
    console.log(`  seeded ${file}`);
  }

  console.log('Seeding users & organization data...');
  await seedUsers();

  console.log('Seed complete.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
