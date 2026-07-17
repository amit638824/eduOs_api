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

  const assignments = await listTestAssignments(id, organizationId);
  return {
    ...test.rows[0],
    sections: sections.rows,
    questions: questions.rows,
    assignments,
  };
}

export async function listTestAssignments(testId: string, organizationId: string) {
  await assertTestOrg(testId, organizationId);
  const result = await query(
    `SELECT ta.id, ta.assignee_id AS student_id, ta.scheduled_at, ta.created_at,
            u.email, u.first_name, u.last_name
     FROM test_assignments ta
     JOIN students s ON s.id = ta.assignee_id
     JOIN users u ON u.id = s.user_id
     WHERE ta.test_id = $1 AND ta.assignee_type = 'student'
     ORDER BY ta.created_at DESC`,
    [testId],
  );
  return result.rows;
}

export async function listAssignableStudents(organizationId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    query(
      `SELECT s.id AS student_id, u.id AS user_id, u.email, u.first_name, u.last_name, u.status
       FROM students s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.organization_id = $1 AND u.deleted_at IS NULL AND u.status = 'active'
       ORDER BY u.first_name, u.last_name
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM students s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.organization_id = $1 AND u.deleted_at IS NULL AND u.status = 'active'`,
      [organizationId],
    ),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
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
    `SELECT id FROM questions WHERE id = $1 AND organization_id = $2 AND status = 'approved' AND archived_at IS NULL`,
    [input.questionId, organizationId],
  );
  if (!qCheck.rows[0]) {
    throw new ForbiddenError('Question must be approved and belong to your organization');
  }

  if (input.sectionId) {
    const section = await query(
      `SELECT ts.id FROM test_sections ts
       JOIN tests t ON t.id = ts.test_id
       WHERE ts.id = $1 AND ts.test_id = $2 AND t.organization_id = $3`,
      [input.sectionId, testId, organizationId],
    );
    if (!section.rows[0]) throw new ForbiddenError('Section does not belong to this test');
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

export async function removeQuestionFromTest(
  testId: string,
  organizationId: string,
  questionId: string,
) {
  await assertTestOrg(testId, organizationId);
  const result = await query(
    `DELETE FROM test_questions
     WHERE test_id = $1 AND question_id = $2
     RETURNING id`,
    [testId, questionId],
  );
  if (!result.rows[0]) throw new NotFoundError('Test question');
  await recalcTestTotalMarks(testId);
  return { testId, questionId, removed: true };
}

export async function updateTest(
  testId: string,
  organizationId: string,
  input: Partial<CreateTestInput & { status?: string }>,
) {
  await assertTestOrg(testId, organizationId);
  if (input.status === 'live') {
    throw new ForbiddenError('Use the publish endpoint to set a test live');
  }
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

export async function deleteTest(testId: string, organizationId: string) {
  await assertTestOrg(testId, organizationId);
  const result = await query(
    `UPDATE tests SET archived_at = NOW(), status = 'archived', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL
     RETURNING id`,
    [testId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Test');
  return { id: result.rows[0].id, deleted: true };
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

export async function unassignStudentFromTest(
  testId: string,
  organizationId: string,
  studentId: string,
) {
  await assertTestOrg(testId, organizationId);
  const student = await query(
    `SELECT id FROM students WHERE id = $1 AND organization_id = $2`,
    [studentId, organizationId],
  );
  if (!student.rows[0]) throw new NotFoundError('Student');

  const result = await query(
    `DELETE FROM test_assignments
     WHERE test_id = $1 AND assignee_type = 'student' AND assignee_id = $2
     RETURNING id`,
    [testId, studentId],
  );
  if (!result.rows[0]) throw new NotFoundError('Assignment');
  return { testId, studentId, removed: true };
}

export async function listStudentAssignedTests(studentId: string, organizationId: string) {
  const result = await query(
    `SELECT DISTINCT ON (t.id)
            t.id, t.title, t.description, t.status, t.duration_minutes,
            t.passing_marks, t.published_at, ta_assign.scheduled_at,
            latest.id AS attempt_id,
            latest.status AS attempt_status,
            latest.submitted_at AS attempt_submitted_at,
            r.percentage AS result_percentage,
            r.attempt_id AS result_attempt_id
     FROM test_assignments ta_assign
     JOIN tests t ON t.id = ta_assign.test_id
     LEFT JOIN LATERAL (
       SELECT ta.id, ta.status, ta.submitted_at
       FROM test_attempts ta
       WHERE ta.test_id = t.id AND ta.student_id = $1
       ORDER BY ta.started_at DESC
       LIMIT 1
     ) latest ON TRUE
     LEFT JOIN results r ON r.attempt_id = latest.id
     WHERE ta_assign.assignee_type = 'student' AND ta_assign.assignee_id = $1
       AND t.organization_id = $2 AND t.status = 'live' AND t.archived_at IS NULL
     ORDER BY t.id, t.published_at DESC NULLS LAST`,
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
