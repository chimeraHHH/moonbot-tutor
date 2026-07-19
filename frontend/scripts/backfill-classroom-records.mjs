import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const classroomIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const classroomsDir = process.env.CLASSROOMS_DIR || '/app/data/classrooms';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function listClassroomFiles() {
  try {
    const entries = await fs.readdir(classroomsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function normalizeLegacyClassroom(fileName, document, stat) {
  const id = fileName.slice(0, -'.json'.length);
  if (!classroomIdPattern.test(id) || !document || typeof document !== 'object') return null;
  if (typeof document.id === 'string' && document.id !== id) return null;

  const stage = document.stage && typeof document.stage === 'object' ? document.stage : {};
  const rawTitle = typeof stage.name === 'string' ? stage.name.trim() : '';
  const title = (rawTitle || `Legacy classroom ${id}`).slice(0, 500);
  const sceneCount = Array.isArray(document.scenes) ? document.scenes.length : 0;
  const parsedCreatedAt =
    typeof document.createdAt === 'string' ? new Date(document.createdAt) : new Date(Number.NaN);
  const createdAt = Number.isFinite(parsedCreatedAt.getTime()) ? parsedCreatedAt : stat.mtime;

  return { id, title, sceneCount, createdAt, source: 'legacy-server-json' };
}

function quarantinedLegacyClassroom(fileName, stat) {
  const id = fileName.slice(0, -'.json'.length);
  if (!classroomIdPattern.test(id)) return null;
  return {
    id,
    title: `[Needs audit] Legacy classroom ${id}`.slice(0, 500),
    sceneCount: 0,
    createdAt: stat.mtime,
    source: 'legacy-quarantined-json',
  };
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let inserted = 0;
let skipped = 0;

try {
  for (const fileName of await listClassroomFiles()) {
    const storagePath = path.join(classroomsDir, fileName);
    let classroom;
    try {
      const stat = await fs.stat(storagePath);
      if (stat.size > 50 * 1024 * 1024) {
        console.warn(`[classroom-backfill] quarantine oversized file ${fileName}`);
        classroom = quarantinedLegacyClassroom(fileName, stat);
      } else {
        try {
          const document = JSON.parse(await fs.readFile(storagePath, 'utf8'));
          classroom = normalizeLegacyClassroom(fileName, document, stat);
        } catch (error) {
          console.warn(
            `[classroom-backfill] quarantine unreadable JSON ${fileName}: ${error.message}`,
          );
          classroom = quarantinedLegacyClassroom(fileName, stat);
        }
      }
      if (!classroom) {
        console.warn(`[classroom-backfill] skip invalid file ${fileName}`);
        skipped += 1;
        continue;
      }
    } catch (error) {
      console.warn(`[classroom-backfill] skip unreadable file ${fileName}: ${error.message}`);
      skipped += 1;
      continue;
    }

    // A database failure is deployment-fatal. Only malformed legacy files are
    // skipped; silently losing the metadata transaction would make preserved
    // bytes unreachable again.
    const result = await pool.query(
      `INSERT INTO classrooms (
         id, owner_user_id, title, storage_path, scene_count, source, created_at, updated_at
       ) VALUES ($1, NULL, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        classroom.id,
        classroom.title,
        storagePath,
        classroom.sceneCount,
        classroom.source,
        classroom.createdAt,
      ],
    );
    inserted += result.rowCount || 0;
  }

  console.log(`[classroom-backfill] inserted=${inserted} skipped=${skipped}`);
  if (skipped > 0) {
    throw new Error(`Classroom backfill could not index ${skipped} legacy file(s)`);
  }
} finally {
  await pool.end();
}
