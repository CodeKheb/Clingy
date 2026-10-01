// Owner: Person B — CRUD/upsert helpers against the SQLite schema in schema.ts.

import { type SQLiteDatabase } from 'expo-sqlite';
import { db as defaultDb, ensureSchema, schemaReady } from './schema';

// ---------------------------------------------------------------------------
// Entity Interfaces
// ---------------------------------------------------------------------------

export type Course = {
  id: string;
  name: string;
};

export type Assignment = {
  id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  raw_json: string | null;
  urgency_score: number;
  suggested_minutes: number;
  embedding: string | null;
};

export type Event = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  raw_json: string | null;
  weight: number;
  embedding: string | null;
};

export type ScheduleBlock = {
  id: string;
  assignment_id: string;
  start_at: string;
  end_at: string;
  embedding: string | null;
};

export type PetState = {
  id: number;
  mood: 'happy' | 'neutral' | 'stressed' | 'urgent';
};

export type EmbeddingRecord = {
  id: string;
  entity_type: string;
  entity_id: string;
  vector: string;
  dim: number;
  created_at: string;
};

// Input types for upserting
export type CourseInput = Course;

export type AssignmentInput = {
  id: string;
  course_id?: string | null;
  title: string;
  description?: string | null;
  due_at?: string | null;
  raw_json?: string | null;
  urgency_score?: number;
  suggested_minutes?: number;
  embedding?: string | number[] | null;
};

export type EventInput = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  raw_json?: string | null;
  weight?: number;
  embedding?: string | number[] | null;
};

export type ScheduleBlockInput = {
  id: string;
  assignment_id: string;
  start_at: string;
  end_at: string;
  embedding?: string | number[] | null;
};

export type EmbeddingInput = {
  id?: string;
  entity_type: 'assignment' | 'schedule_block' | 'event' | string;
  entity_id: string;
  vector: string | number[];
  dim?: number;
};

// Helper to resolve database parameter
async function getDb(database?: SQLiteDatabase): Promise<SQLiteDatabase> {
  if (database) {
    await ensureSchema(database);
    return database;
  }
  await schemaReady;
  return defaultDb;
}

// Helper to normalize embedding vectors to JSON string
function serializeEmbedding(embedding?: string | number[] | null): string | null {
  if (embedding == null) return null;
  let values: unknown;
  if (typeof embedding === 'string') {
    try {
      values = JSON.parse(embedding);
    } catch {
      throw new TypeError('Embedding must be a JSON array of finite numbers.');
    }
  } else {
    values = embedding;
  }
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError('Embedding must be a non-empty array of finite numbers.');
  }
  return JSON.stringify(values);
}

function embeddingDimension(vector: string, requestedDim?: number): number {
  const values = JSON.parse(vector) as unknown[];
  const dim = requestedDim ?? values.length;
  if (!Number.isInteger(dim) || dim <= 0 || dim !== values.length) {
    throw new RangeError(`Embedding dimension ${dim} does not match vector length ${values.length}.`);
  }
  return dim;
}

async function writeEmbedding(input: EmbeddingInput, db: SQLiteDatabase): Promise<void> {
  const id = input.id ?? `${input.entity_type}_${input.entity_id}`;
  const vector = serializeEmbedding(input.vector);
  if (!vector) throw new TypeError('Embedding vector cannot be empty.');
  const dim = embeddingDimension(vector, input.dim);
  await db.runAsync(
    `INSERT INTO embeddings (id, entity_type, entity_id, vector, dim)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       entity_type = excluded.entity_type,
       entity_id = excluded.entity_id,
       vector = excluded.vector,
       dim = excluded.dim,
       created_at = CURRENT_TIMESTAMP;`,
    id,
    input.entity_type,
    input.entity_id,
    vector,
    dim,
  );
}

// ---------------------------------------------------------------------------
// Courses CRUD
// ---------------------------------------------------------------------------

export async function upsertCourse(course: CourseInput, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.runAsync(
    `INSERT INTO courses (id, name)
     VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name;`,
    course.id,
    course.name
  );
}

export async function upsertCourses(courses: CourseInput[], database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    for (const course of courses) {
      await upsertCourse(course, db);
    }
  });
}

export async function getAllCourses(database?: SQLiteDatabase): Promise<Course[]> {
  const db = await getDb(database);
  return await db.getAllAsync<Course>('SELECT * FROM courses ORDER BY name ASC;');
}

export async function getCourseById(id: string, database?: SQLiteDatabase): Promise<Course | null> {
  const db = await getDb(database);
  return await db.getFirstAsync<Course>('SELECT * FROM courses WHERE id = ?;', id);
}

export async function deleteCourse(id: string, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE assignments SET course_id = NULL WHERE course_id = ?;', id);
    await db.runAsync('DELETE FROM courses WHERE id = ?;', id);
  });
}

export async function clearCourses(database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE assignments SET course_id = NULL WHERE course_id IS NOT NULL;');
    await db.runAsync('DELETE FROM courses;');
  });
}

// ---------------------------------------------------------------------------
// Assignments CRUD
// ---------------------------------------------------------------------------

export async function upsertAssignment(assignment: AssignmentInput, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  const courseId = assignment.course_id ?? null;
  const description = assignment.description ?? null;
  const dueAt = assignment.due_at ?? null;
  const rawJson = assignment.raw_json ?? null;
  const urgencyScore = assignment.urgency_score ?? 0;
  const suggestedMinutes = assignment.suggested_minutes ?? 0;
  const embeddingStr = serializeEmbedding(assignment.embedding);
  if (!Number.isFinite(urgencyScore) || urgencyScore < 0 || urgencyScore > 1) {
    throw new RangeError('urgency_score must be between 0 and 1.');
  }
  if (!Number.isInteger(suggestedMinutes) || suggestedMinutes < 0) {
    throw new RangeError('suggested_minutes must be a non-negative integer.');
  }

  await db.runAsync(
    `INSERT INTO assignments (id, course_id, title, description, due_at, raw_json, urgency_score, suggested_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       course_id = excluded.course_id,
       title = excluded.title,
       description = excluded.description,
       due_at = excluded.due_at,
       raw_json = excluded.raw_json,
       urgency_score = CASE WHEN ? IS NULL THEN assignments.urgency_score ELSE excluded.urgency_score END,
        suggested_minutes = CASE WHEN ? IS NULL THEN assignments.suggested_minutes ELSE excluded.suggested_minutes END;`,
    assignment.id,
    courseId,
    assignment.title,
    description,
    dueAt,
    rawJson,
    urgencyScore,
    suggestedMinutes,
    assignment.urgency_score ?? null,
    assignment.suggested_minutes ?? null,
  );
  if (embeddingStr) {
    await writeEmbedding({ entity_type: 'assignment', entity_id: assignment.id, vector: embeddingStr }, db);
  }
}

export async function upsertAssignments(assignments: AssignmentInput[], database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    for (const assignment of assignments) {
      await upsertAssignment(assignment, db);
    }
  });
}

export async function getAllAssignments(database?: SQLiteDatabase): Promise<Assignment[]> {
  const db = await getDb(database);
  return await db.getAllAsync<Assignment>(
    `SELECT assignments.*, (SELECT vector FROM embeddings WHERE entity_type = 'assignment' AND entity_id = assignments.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM assignments ORDER BY due_at ASC NULLS LAST;`,
  );
}

export async function getAssignmentById(id: string, database?: SQLiteDatabase): Promise<Assignment | null> {
  const db = await getDb(database);
  return await db.getFirstAsync<Assignment>(
    `SELECT assignments.*, (SELECT vector FROM embeddings WHERE entity_type = 'assignment' AND entity_id = assignments.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM assignments WHERE id = ?;`, id,
  );
}

export async function getAssignmentsByCourse(courseId: string, database?: SQLiteDatabase): Promise<Assignment[]> {
  const db = await getDb(database);
  return await db.getAllAsync<Assignment>(
    `SELECT assignments.*, (SELECT vector FROM embeddings WHERE entity_type = 'assignment' AND entity_id = assignments.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM assignments WHERE course_id = ? ORDER BY due_at ASC NULLS LAST;`, courseId,
  );
}

export async function getUpcomingAssignments(database?: SQLiteDatabase): Promise<Assignment[]> {
  const db = await getDb(database);
  return await db.getAllAsync<Assignment>(
    `SELECT assignments.*, (SELECT vector FROM embeddings WHERE entity_type = 'assignment' AND entity_id = assignments.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM assignments
     WHERE due_at IS NOT NULL AND julianday(due_at) >= julianday('now')
     ORDER BY urgency_score DESC, due_at ASC NULLS LAST;`
  );
}

export async function updateAssignmentPriority(
  id: string,
  urgencyScore: number,
  suggestedMinutes: number,
  database?: SQLiteDatabase
): Promise<void> {
  const db = await getDb(database);
  if (!Number.isFinite(urgencyScore) || urgencyScore < 0 || urgencyScore > 1) {
    throw new RangeError('urgencyScore must be between 0 and 1.');
  }
  if (!Number.isInteger(suggestedMinutes) || suggestedMinutes < 0) {
    throw new RangeError('suggestedMinutes must be a non-negative integer.');
  }
  await db.runAsync(
    `UPDATE assignments SET urgency_score = ?, suggested_minutes = ? WHERE id = ?;`,
    urgencyScore,
    suggestedMinutes,
    id
  );
}

export async function updateAssignmentEmbedding(
  id: string,
  embedding: string | number[],
  database?: SQLiteDatabase
): Promise<void> {
  const db = await getDb(database);
  await writeEmbedding({ entity_type: 'assignment', entity_id: id, vector: embedding }, db);
}

export async function deleteAssignment(id: string, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM embeddings WHERE entity_type IN ('assignment', 'schedule_block') AND entity_id IN (SELECT id FROM schedule_blocks WHERE assignment_id = ? UNION SELECT ?);", id, id);
    await db.runAsync('DELETE FROM assignments WHERE id = ?;', id);
  });
}

export async function clearAssignments(database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM embeddings WHERE entity_type = 'assignment' OR (entity_type = 'schedule_block' AND entity_id IN (SELECT id FROM schedule_blocks));");
    await db.runAsync('DELETE FROM assignments;');
  });
}

// ---------------------------------------------------------------------------
// Events CRUD
// ---------------------------------------------------------------------------

export async function upsertEvent(event: EventInput, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  const rawJson = event.raw_json ?? null;
  const embedding = serializeEmbedding(event.embedding);
  const weight = event.weight ?? 1;
  if (!Number.isFinite(weight) || weight < 0) {
    throw new RangeError('Event weight must be a finite non-negative number.');
  }

  await db.runAsync(
    `INSERT INTO events (id, title, start_at, end_at, raw_json, weight)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       start_at = excluded.start_at,
       end_at = excluded.end_at,
       raw_json = excluded.raw_json,
       weight = CASE WHEN ? IS NULL THEN events.weight ELSE excluded.weight END;`,
    event.id,
    event.title,
    event.start_at,
    event.end_at,
    rawJson,
    weight,
    event.weight ?? null,
  );
  if (embedding) {
    await writeEmbedding({ entity_type: 'event', entity_id: event.id, vector: embedding }, db);
  }
}

export async function upsertEvents(events: EventInput[], database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    for (const event of events) {
      await upsertEvent(event, db);
    }
  });
}

export async function getAllEvents(database?: SQLiteDatabase): Promise<Event[]> {
  const db = await getDb(database);
  return await db.getAllAsync<Event>(
    `SELECT events.*, (SELECT vector FROM embeddings WHERE entity_type = 'event' AND entity_id = events.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM events ORDER BY start_at ASC;`,
  );
}

export async function getEventById(id: string, database?: SQLiteDatabase): Promise<Event | null> {
  const db = await getDb(database);
  return await db.getFirstAsync<Event>(
    `SELECT events.*, (SELECT vector FROM embeddings WHERE entity_type = 'event' AND entity_id = events.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM events WHERE id = ?;`, id,
  );
}

export async function getUpcomingEvents(startAfterIso?: string, database?: SQLiteDatabase): Promise<Event[]> {
  const db = await getDb(database);
  const minTime = startAfterIso ?? new Date().toISOString();
  return await db.getAllAsync<Event>(
    `SELECT events.*, (SELECT vector FROM embeddings WHERE entity_type = 'event' AND entity_id = events.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM events WHERE end_at >= ? ORDER BY start_at ASC;`, minTime,
  );
}

export async function getEventsInWindow(startAtIso: string, endAtIso: string, database?: SQLiteDatabase): Promise<Event[]> {
  const db = await getDb(database);
  return await db.getAllAsync<Event>(
    `SELECT events.*, (SELECT vector FROM embeddings WHERE entity_type = 'event' AND entity_id = events.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM events WHERE end_at >= ? AND start_at <= ? ORDER BY start_at ASC;`,
    startAtIso,
    endAtIso
  );
}

export async function deleteEvent(id: string, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM embeddings WHERE entity_type = 'event' AND entity_id = ?;", id);
    await db.runAsync('DELETE FROM events WHERE id = ?;', id);
  });
}

export async function clearEvents(database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM embeddings WHERE entity_type = 'event';");
    await db.runAsync('DELETE FROM events;');
  });
}

// ---------------------------------------------------------------------------
// Schedule Blocks CRUD
// ---------------------------------------------------------------------------

export async function upsertScheduleBlock(block: ScheduleBlockInput, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  const embeddingStr = serializeEmbedding(block.embedding);

  await db.runAsync(
    `INSERT INTO schedule_blocks (id, assignment_id, start_at, end_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       assignment_id = excluded.assignment_id,
       start_at = excluded.start_at,
       end_at = excluded.end_at;`,
    block.id,
    block.assignment_id,
    block.start_at,
    block.end_at
  );
  if (embeddingStr) {
    await writeEmbedding({ entity_type: 'schedule_block', entity_id: block.id, vector: embeddingStr }, db);
  }
}

export async function upsertScheduleBlocks(blocks: ScheduleBlockInput[], database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    for (const block of blocks) {
      await upsertScheduleBlock(block, db);
    }
  });
}

export async function getAllScheduleBlocks(database?: SQLiteDatabase): Promise<ScheduleBlock[]> {
  const db = await getDb(database);
  return await db.getAllAsync<ScheduleBlock>(
    `SELECT schedule_blocks.*, (SELECT vector FROM embeddings WHERE entity_type = 'schedule_block' AND entity_id = schedule_blocks.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM schedule_blocks ORDER BY start_at ASC;`,
  );
}

export type ScheduleBlockWithAssignment = ScheduleBlock & { assignment_title: string };

export async function getUpcomingScheduleBlocks(
  nowIso: string = new Date().toISOString(),
  database?: SQLiteDatabase
): Promise<ScheduleBlockWithAssignment[]> {
  const db = await getDb(database);
  return await db.getAllAsync<ScheduleBlockWithAssignment>(
    `SELECT schedule_blocks.*, assignments.title AS assignment_title,
       (SELECT vector FROM embeddings WHERE entity_type = 'schedule_block' AND entity_id = schedule_blocks.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM schedule_blocks
     JOIN assignments ON assignments.id = schedule_blocks.assignment_id
     WHERE schedule_blocks.end_at >= ?
     ORDER BY schedule_blocks.start_at ASC;`,
    nowIso
  );
}

export async function getScheduleBlockById(id: string, database?: SQLiteDatabase): Promise<ScheduleBlock | null> {
  const db = await getDb(database);
  return await db.getFirstAsync<ScheduleBlock>(
    `SELECT schedule_blocks.*, (SELECT vector FROM embeddings WHERE entity_type = 'schedule_block' AND entity_id = schedule_blocks.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM schedule_blocks WHERE id = ?;`, id,
  );
}

export async function getScheduleBlocksForAssignment(assignmentId: string, database?: SQLiteDatabase): Promise<ScheduleBlock[]> {
  const db = await getDb(database);
  return await db.getAllAsync<ScheduleBlock>(
    `SELECT schedule_blocks.*, (SELECT vector FROM embeddings WHERE entity_type = 'schedule_block' AND entity_id = schedule_blocks.id ORDER BY created_at DESC LIMIT 1) AS embedding
     FROM schedule_blocks WHERE assignment_id = ? ORDER BY start_at ASC;`, assignmentId,
  );
}

export async function updateScheduleBlockEmbedding(
  id: string,
  embedding: string | number[],
  database?: SQLiteDatabase
): Promise<void> {
  const db = await getDb(database);
  await writeEmbedding({ entity_type: 'schedule_block', entity_id: id, vector: embedding }, db);
}

export async function deleteScheduleBlock(id: string, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM embeddings WHERE entity_type = 'schedule_block' AND entity_id = ?;", id);
    await db.runAsync('DELETE FROM schedule_blocks WHERE id = ?;', id);
  });
}

export async function clearScheduleBlocks(database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM embeddings WHERE entity_type = 'schedule_block';");
    await db.runAsync('DELETE FROM schedule_blocks;');
  });
}

// ---------------------------------------------------------------------------
// Dedicated Embeddings Table CRUD
// ---------------------------------------------------------------------------

export async function upsertEmbedding(input: EmbeddingInput, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await writeEmbedding(input, db);
}

export async function getEmbeddingById(id: string, database?: SQLiteDatabase): Promise<EmbeddingRecord | null> {
  const db = await getDb(database);
  return await db.getFirstAsync<EmbeddingRecord>('SELECT * FROM embeddings WHERE id = ?;', id);
}

export async function getEmbeddingsForEntity(
  entityType: string,
  entityId: string,
  database?: SQLiteDatabase
): Promise<EmbeddingRecord[]> {
  const db = await getDb(database);
  return await db.getAllAsync<EmbeddingRecord>(
    'SELECT * FROM embeddings WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC;',
    entityType,
    entityId
  );
}

export async function deleteEmbedding(id: string, database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.runAsync('DELETE FROM embeddings WHERE id = ?;', id);
}

export async function clearEmbeddings(database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.runAsync('DELETE FROM embeddings;');
}

// ---------------------------------------------------------------------------
// Pet State CRUD
// ---------------------------------------------------------------------------

export async function getPetState(database?: SQLiteDatabase): Promise<PetState> {
  const db = await getDb(database);
  const row = await db.getFirstAsync<PetState>('SELECT * FROM pet_state WHERE id = 1;');
  if (!row) {
    return { id: 1, mood: 'neutral' };
  }
  return row;
}

export async function updatePetMood(mood: PetState['mood'], database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.runAsync(
    `INSERT INTO pet_state (id, mood) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET mood = excluded.mood;`,
    mood
  );
}

// ---------------------------------------------------------------------------
// Database Utility Helpers
// ---------------------------------------------------------------------------

export async function clearAllData(database?: SQLiteDatabase): Promise<void> {
  const db = await getDb(database);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM embeddings;');
    await db.runAsync('DELETE FROM schedule_blocks;');
    await db.runAsync('DELETE FROM assignments;');
    await db.runAsync('DELETE FROM courses;');
    await db.runAsync('DELETE FROM events;');
    await db.runAsync("UPDATE pet_state SET mood = 'neutral' WHERE id = 1;");
  });
}
