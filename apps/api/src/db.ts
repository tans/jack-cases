import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrateDatabase } from './migrations.js';
fs.mkdirSync(path.dirname(config.database), { recursive: true });
export const sqlite = new Database(config.database);
sqlite.pragma('secure_delete = ON');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
migrateDatabase(sqlite);

export const db = drizzle(sqlite, { schema });
