// Embeddings are stored in the dedicated
// embeddings table so each entity has one canonical vector record.

import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

const initializations = new WeakMap<SQLiteDatabase, Promise<void>>();

async function addColumnIfMissing(
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  if (!columns.some(({ name }) => name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

async function migrateLegacyEmbeddings(
  db: SQLiteDatabase,
  table: 'assignments' | 'schedule_blocks',
  entityType: 'assignment' | 'schedule_block',
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  if (!columns.some(({ name }) => name === 'embedding')) return;

  const rows = await db.getAllAsync<{ id: string; embedding: string }>(
    `SELECT id, embedding FROM ${table} WHERE embedding IS NOT NULL;`,
  );
  for (const row of rows) {
    let vector: unknown;
    try {
      vector = JSON.parse(row.embedding);
    } catch {
      continue;
    }
    if (!Array.isArray(vector) || vector.length === 0 || vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      continue;
    }
    await db.runAsync(
      `INSERT OR IGNORE INTO embeddings (id, entity_type, entity_id, vector, dim) VALUES (?, ?, ?, ?, ?);`,
      `${entityType}_${row.id}`,
      entityType,
      row.id,
      JSON.stringify(vector),
      vector.length,
    );
  }
}

async function createSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      course_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      due_at TEXT,
      raw_json TEXT,
      urgency_score REAL DEFAULT 0,
      suggested_minutes INTEGER DEFAULT 0,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      raw_json TEXT,
      weight REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS schedule_blocks (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pet_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mood TEXT NOT NULL DEFAULT 'neutral'
    );

    CREATE TABLE IF NOT EXISTS dismissed_assignments (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_minutes INTEGER NOT NULL,
      end_minutes INTEGER NOT NULL,
      room TEXT
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      vector TEXT NOT NULL,
      dim INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (dim > 0)
    );
  `);

  await addColumnIfMissing(db, 'events', 'weight', 'REAL NOT NULL DEFAULT 1');
  await addColumnIfMissing(db, 'assignments', 'task_type', "TEXT NOT NULL DEFAULT 'general'");
  await db.execAsync(`INSERT OR IGNORE INTO pet_state (id, mood) VALUES (1, 'neutral');`);

  // Migrate valid vectors from earlier per-row columns into the canonical table.
  await migrateLegacyEmbeddings(db, 'assignments', 'assignment');
  await migrateLegacyEmbeddings(db, 'schedule_blocks', 'schedule_block');
}

// Initialization is cached per connection, shared by the app bootstrap and CRUD.
export function ensureSchema(db: SQLiteDatabase): Promise<void> {
  const existing = initializations.get(db);
  if (existing) return existing;

  const initialization = createSchema(db);
  initializations.set(db, initialization);
  return initialization;
}

export const db = openDatabaseSync('clingy.db');
export const schemaReady = ensureSchema(db);
