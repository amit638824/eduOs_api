import { query } from '../config/database.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export async function listSubjects(
  organizationId: string,
  page: number,
  limit: number,
  departmentId?: string,
) {
  const offset = (page - 1) * limit;
  const params: unknown[] = [organizationId];
  let where = 'organization_id = $1 AND is_active = TRUE';
  if (departmentId) {
    params.push(departmentId);
    where += ` AND department_id = $${params.length}`;
  }
  params.push(limit, offset);

  const [data, count] = await Promise.all([
    query(
      `SELECT id, organization_id, department_id, name, code, language, is_active, created_at
       FROM subjects WHERE ${where}
       ORDER BY name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM subjects WHERE ${where}`, params.slice(0, -2)),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function createSubject(
  organizationId: string,
  input: { name: string; code?: string; language?: string; departmentId: string },
) {
  await assertDepartmentOrg(input.departmentId, organizationId);
  const result = await query(
    `INSERT INTO subjects (organization_id, department_id, name, code, language)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, organization_id, department_id, name, code, language, is_active, created_at`,
    [organizationId, input.departmentId, input.name, input.code ?? null, input.language ?? 'en'],
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

/** Flatten topics for a subject (across all chapters) — used by question bank UI */
export async function listTopicsForSubject(subjectId: string, organizationId: string) {
  await assertSubjectOrg(subjectId, organizationId);
  const result = await query(
    `SELECT t.id, t.chapter_id, t.name, t.difficulty, t.tags, t.sort_order, t.created_at,
            c.name AS chapter_name
     FROM topics t
     JOIN chapters c ON c.id = t.chapter_id
     WHERE c.subject_id = $1
     ORDER BY c.sort_order, t.sort_order, t.name`,
    [subjectId],
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

/** Create topic under subject — auto-creates a default chapter if none exists */
export async function createTopicForSubject(
  subjectId: string,
  organizationId: string,
  input: { name: string; difficulty?: number; tags?: string[]; chapterName?: string },
) {
  await assertSubjectOrg(subjectId, organizationId);
  let chapters = await listChapters(subjectId, organizationId);
  if (chapters.length === 0) {
    const chapter = await createChapter(subjectId, organizationId, {
      name: input.chapterName ?? 'General',
      sortOrder: 1,
    });
    chapters = [chapter];
  }
  return createTopic(chapters[0].id as string, organizationId, {
    name: input.name,
    difficulty: input.difficulty,
    tags: input.tags,
  });
}

async function assertDepartmentOrg(departmentId: string, organizationId: string) {
  const result = await query(
    `SELECT d.id FROM departments d
     JOIN branches b ON b.id = d.branch_id
     WHERE d.id = $1 AND b.organization_id = $2 AND d.deleted_at IS NULL`,
    [departmentId, organizationId],
  );
  if (!result.rows[0]) throw new ForbiddenError('Department not found in this organization');
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
