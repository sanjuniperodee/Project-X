import { createDatabase, runMigrations } from './client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const database = createDatabase(url);
await runMigrations(database.db, process.env.MIGRATIONS_DIR ?? './drizzle');
await database.close();
console.log('Migrations applied');
