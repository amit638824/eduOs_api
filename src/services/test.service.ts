import { query } from '../config/database.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';

export interface CreateTestInput {
  title: string;
  description?: string;
  durationMinutes?: number;
  passingMarks?: number;
  instructions?: string;
  config?: Record<string, unknown>;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export async function listTests(
  organizationId: string,
  page: number,
  limit: number,
  status?: string,
) {
  const offset = (page - 1) * limit;
  const params: unknown[] = [organizationId];
  let where = 'organization_id = $1 AND archived_at IS NULL';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  params.push(limit, offset);

  const [data, count] = await Promise.all([
    query(
      `SELECT id, title, description, status, duration_minutes, passing_marks, total_marks,
              scheduled_start, scheduled_end, published_at, created_at, updated_at
       FROM tests WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(`SELECT COUNT(*)::int AS total FROM tests WHERE ${where}`, params.slice(0, -2)),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function getTestById(id: string, organizationId: string) {
  const test = await query(
    `SELECT id, organization_id, title, description, status, config, instructions,
            duration_minutes, passing_marks, total_marks, scheduled_start, scheduled_end,
            published_at, created_at, updated_at
     FROM tests WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`,
    [id, organizationId],
  );
  if (!test.rows[0]) throw new NotFoundError('Test');

  const [sections, questions] = await Promise.all([
    query(
      `SELECT id, name, sort_order, config FROM test_sections WHERE test_id = $1 ORDER BY sort_order`,
      [id],
    ),
    query(
      `SELECT tq.id, tq.section_id, tq.question_id, tq.sort_order, tq.marks_override,
              q.type, q.content, q.marks, q.difficulty
       FROM test_questions tq
       JOIN questions q ON q.id = tq.question_id
       WHERE tq.test_id = $1 ORDER BY tq.sort_order`,
      [id],
    ),
  ]);

  return { ...test.rows[0], sections: sections.rows, questions: questions.rows };
}

export async function createTest(organizationId: string, userId: string, input: CreateTestInput) {
  const result = await query(
    `INSERT INTO tests (
       organization_id, created_by, title, description, duration_minutes, passing_marks,
       instructions, config, scheduled_start, scheduled_end, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')
     RETURNING id, title, status, duration_minutes, created_at`,
    [
      organizationId,
      userId,
      input.title,
      input.description ?? null,
      input.durationMinutes ?? 60,
      input.passingMarks ?? null,
      input.instructions ?? null,
      JSON.stringify(input.config ?? {}),
      input.scheduledStart ?? null,
      input.scheduledEnd ?? null,
    ],
  );
  return result.rows[0];
}

export async function addTestSection(
  testId: string,
  organizationId: string,
  input: { name: string; sortOrder?: number; config?: Record<string, unknown> },
) {
  await assertTestOrg(testId, organizationId);
  const result = await query(
    `INSERT INTO test_sections (test_id, name, sort_order, config)
     VALUES ($1, $2, $3, $4) RETURNING id, test_id, name, sort_order`,
    [testId, input.name, input.sortOrder ?? 0, JSON.stringify(input.config ?? {})],
  );
  return result.rows[0];
}

export async function addQuestionToTest(
  testId: string,
  organizationId: string,
  input: { questionId: string; sectionId?: string; sortOrder?: number; marksOverride?: number },
) {
  await assertTestOrg(testId, organizationId);
  const qCheck = await query(
    `SELECT id FROM questions WHERE id = $1 AND organization_id = $2 AND status = 'approved'`,
    [input.questionId, organizationId],
  );
  if (!qCheck.rows[0]) {
    throw new ForbiddenError('Question must be approved and belong to your organization');
  }

  try {
    const result = await query(
      `INSERT INTO test_questions (test_id, section_id, question_id, sort_order, marks_override)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, test_id, question_id, section_id, sort_order`,
      [
        testId,
        input.sectionId ?? null,
        input.questionId,
        input.sortOrder ?? 0,
        input.marksOverride ?? null,
      ],
    );
    await recalcTestTotalMarks(testId);
    return result.rows[0];
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      throw new ConflictError('Question already added to this test');
    }
    throw err;
  }
}

export async function updateTest(
  testId: string,
  organizationId: string,
  input: Partial<CreateTestInput & { status?: string }>,
) {
  await assertTestOrg(testId, organizationId);
  const result = await query(
    `UPDATE tests SET
       title = COALESCE($3, title),
       description = COALESCE($4, description),
       duration_minutes = COALESCE($5, duration_minutes),
       passing_marks = COALESCE($6, passing_marks),
       instructions = COALESCE($7, instructions),
       config = COALESCE($8, config),
       scheduled_start = COALESCE($9, scheduled_start),
       scheduled_end = COALESCE($10, scheduled_end),
       status = COALESCE($11, status),
       updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL
     RETURNING id, title, status, duration_minutes, config, scheduled_start, scheduled_end, updated_at`,
    [
      testId,
      organizationId,
      input.title ?? null,
      input.description ?? null,
      input.durationMinutes ?? null,
      input.passingMarks ?? null,
      input.instructions ?? null,
      input.config ? JSON.stringify(input.config) : null,
      input.scheduledStart ?? null,
      input.scheduledEnd ?? null,
      input.status ?? null,
    ],
  );
  if (!result.rows[0]) throw new NotFoundError('Test');
  return result.rows[0];
}

export async function publishTest(testId: string, organizationId: string) {
  await assertTestOrg(testId, organizationId);
  const qCount = await query(
    `SELECT COUNT(*)::int AS cnt FROM test_questions WHERE test_id = $1`,
    [testId],
  );
  if ((qCount.rows[0].cnt as number) === 0) {
    throw new ConflictError('Add at least one question before publishing');
  }

  const result = await query(
    `UPDATE tests SET status = 'live', published_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND status IN ('draft', 'scheduled')
     RETURNING id, status, published_at`,
    [testId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Test');
  return result.rows[0];
}

export async function assignTestToStudent(
  testId: string,
  organizationId: string,
  studentId: string,
  scheduledAt?: string,
) {
  await assertTestOrg(testId, organizationId);
  const student = await query(
    `SELECT id FROM students WHERE id = $1 AND organization_id = $2`,
    [studentId, organizationId],
  );
  if (!student.rows[0]) throw new NotFoundError('Student');

  const result = await query(
    `INSERT INTO test_assignments (test_id, assignee_type, assignee_id, scheduled_at)
     VALUES ($1, 'student', $2, $3)
     RETURNING id, test_id, assignee_type, assignee_id, scheduled_at, created_at`,
    [testId, studentId, scheduledAt ?? null],
  );
  return result.rows[0];
}

export async function listStudentAssignedTests(studentId: string, organizationId: string) {
  const result = await query(
    `SELECT DISTINCT t.id, t.title, t.description, t.status, t.duration_minutes,
            t.passing_marks, t.published_at, ta.scheduled_at
     FROM test_assignments ta
     JOIN tests t ON t.id = ta.test_id
     WHERE ta.assignee_type = 'student' AND ta.assignee_id = $1
       AND t.organization_id = $2 AND t.status = 'live' AND t.archived_at IS NULL
     ORDER BY t.published_at DESC NULLS LAST`,
    [studentId, organizationId],
  );
  return result.rows;
}

async function recalcTestTotalMarks(testId: string) {
  await query(
    `UPDATE tests SET total_marks = (
       SELECT COALESCE(SUM(COALESCE(tq.marks_override, q.marks)), 0)
       FROM test_questions tq JOIN questions q ON q.id = tq.question_id
       WHERE tq.test_id = $1
     ), updated_at = NOW() WHERE id = $1`,
    [testId],
  );
}

async function assertTestOrg(testId: string, organizationId: string) {
  const result = await query(`SELECT id FROM tests WHERE id = $1 AND organization_id = $2`, [
    testId,
    organizationId,
  ]);
  if (!result.rows[0]) throw new NotFoundError('Test');
}
