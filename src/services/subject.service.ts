import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export async function listSubjects(organizationId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    query(
      `SELECT id, organization_id, name, code, language, is_active, created_at
       FROM subjects WHERE organization_id = $1 AND is_active = TRUE
       ORDER BY name ASC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM subjects WHERE organization_id = $1 AND is_active = TRUE`, [
      organizationId,
    ]),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function createSubject(
  organizationId: string,
  input: { name: string; code?: string; language?: string },
) {
  const result = await query(
    `INSERT INTO subjects (organization_id, name, code, language)
     VALUES ($1, $2, $3, $4)
     RETURNING id, organization_id, name, code, language, is_active, created_at`,
    [organizationId, input.name, input.code ?? null, input.language ?? 'en'],
  );
  return result.rows[0];
}

export async function listChapters(subjectId: string, organizationId: string) {
  await assertSubjectOrg(subjectId, organizationId);
  const result = await query(
    `SELECT id, subject_id, name, sort_order, created_at
     FROM chapters WHERE subject_id = $1 ORDER BY sort_order, name`,
    [subjectId],
  );
  return result.rows;
}

export async function createChapter(
  subjectId: string,
  organizationId: string,
  input: { name: string; sortOrder?: number },
) {
  await assertSubjectOrg(subjectId, organizationId);
  const result = await query(
    `INSERT INTO chapters (subject_id, name, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id, subject_id, name, sort_order, created_at`,
    [subjectId, input.name, input.sortOrder ?? 0],
  );
  return result.rows[0];
}

export async function listTopics(chapterId: string, organizationId: string) {
  await assertChapterOrg(chapterId, organizationId);
  const result = await query(
    `SELECT id, chapter_id, name, difficulty, tags, sort_order, created_at
     FROM topics WHERE chapter_id = $1 ORDER BY sort_order, name`,
    [chapterId],
  );
  return result.rows;
}

export async function createTopic(
  chapterId: string,
  organizationId: string,
  input: { name: string; difficulty?: number; tags?: string[]; sortOrder?: number },
) {
  await assertChapterOrg(chapterId, organizationId);
  const result = await query(
    `INSERT INTO topics (chapter_id, name, difficulty, tags, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, chapter_id, name, difficulty, tags, sort_order, created_at`,
    [chapterId, input.name, input.difficulty ?? null, input.tags ?? [], input.sortOrder ?? 0],
  );
  return result.rows[0];
}

async function assertSubjectOrg(subjectId: string, organizationId: string) {
  const result = await query(`SELECT id FROM subjects WHERE id = $1 AND organization_id = $2`, [
    subjectId,
    organizationId,
  ]);
  if (!result.rows[0]) throw new NotFoundError('Subject');
}

async function assertChapterOrg(chapterId: string, organizationId: string) {
  const result = await query(
    `SELECT c.id FROM chapters c
     JOIN subjects s ON s.id = c.subject_id
     WHERE c.id = $1 AND s.organization_id = $2`,
    [chapterId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Chapter');
}
