import { query, withTransaction } from '../config/database.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';
import { PaginatedResult } from '../types/express.js';
import { parseExamConfig, seededShuffle } from '../utils/examConfig.js';

export async function getStudentIdByUserId(userId: string): Promise<string> {
  const result = await query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
  if (!result.rows[0]) throw new ForbiddenError('Student profile not found');
  return result.rows[0].id as string;
}

function getEndsAt(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
}

function getRemainingSeconds(startedAt: Date, durationMinutes: number): number {
  const endsAt = getEndsAt(startedAt, durationMinutes);
  return Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
}

function isExpired(startedAt: Date, durationMinutes: number): boolean {
  return getRemainingSeconds(startedAt, durationMinutes) <= 0;
}

function countTabSwitches(proctoringLog: unknown): number {
  if (!Array.isArray(proctoringLog)) return 0;
  return proctoringLog.filter((e) => (e as { event?: string })?.event === 'tab_switch').length;
}

export async function startAttempt(testId: string, studentId: string, organizationId: string) {
  const test = await query(
    `SELECT id, status, duration_minutes, config FROM tests
     WHERE id = $1 AND organization_id = $2 AND status = 'live'`,
    [testId, organizationId],
  );
  if (!test.rows[0]) throw new NotFoundError('Test');

  const assigned = await query(
    `SELECT id FROM test_assignments
     WHERE test_id = $1 AND assignee_type = 'student' AND assignee_id = $2`,
    [testId, studentId],
  );
  if (!assigned.rows[0]) {
    throw new ForbiddenError('Test is not assigned to you');
  }

  const existing = await query(
    `SELECT id, status, started_at FROM test_attempts
     WHERE test_id = $1 AND student_id = $2 AND status = 'in_progress'`,
    [testId, studentId],
  );
  if (existing.rows[0]) {
    const duration = Number(test.rows[0].duration_minutes) || 60;
    if (isExpired(new Date(existing.rows[0].started_at), duration)) {
      await submitAttempt(existing.rows[0].id as string, studentId, { autoSubmit: true });
      throw new ConflictError('Time expired — test was auto-submitted');
    }
    return existing.rows[0];
  }

  const submitted = await query(
    `SELECT id FROM test_attempts
     WHERE test_id = $1 AND student_id = $2 AND status IN ('submitted', 'auto_submitted')`,
    [testId, studentId],
  );
  if (submitted.rows[0]) {
    throw new ConflictError('You have already submitted this test');
  }

  const result = await query(
    `INSERT INTO test_attempts (test_id, student_id, status)
     VALUES ($1, $2, 'in_progress')
     RETURNING id, test_id, student_id, status, started_at`,
    [testId, studentId],
  );
  return result.rows[0];
}

async function loadAttemptRow(attemptId: string, studentId: string) {
  const attempt = await query(
    `SELECT ta.id, ta.test_id, ta.student_id, ta.status, ta.started_at, ta.submitted_at,
            ta.proctoring_log,
            t.title, t.duration_minutes, t.instructions, t.config, t.passing_marks
     FROM test_attempts ta
     JOIN tests t ON t.id = ta.test_id
     WHERE ta.id = $1 AND ta.student_id = $2`,
    [attemptId, studentId],
  );
  if (!attempt.rows[0]) throw new NotFoundError('Attempt');
  return attempt.rows[0];
}

export async function getAttemptForStudent(attemptId: string, studentId: string) {
  const row = await loadAttemptRow(attemptId, studentId);
  const duration = Number(row.duration_minutes) || 60;
  const startedAt = new Date(row.started_at);
  const config = parseExamConfig(row.config);

    if (row.status === 'in_progress' && isExpired(startedAt, duration)) {
      await submitAttempt(attemptId, studentId, { autoSubmit: true });
      throw new ConflictError('TIME_EXPIRED');
    }

  const questions = await query(
    `SELECT tq.question_id, tq.sort_order, q.type, q.content, q.marks,
            COALESCE(aa.answer, NULL) AS answer, aa.answered_at
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     LEFT JOIN attempt_answers aa ON aa.attempt_id = $1 AND aa.question_id = q.id
     WHERE tq.test_id = $2
     ORDER BY tq.sort_order`,
    [attemptId, row.test_id],
  );

  const options = await query(
    `SELECT qo.id, qo.question_id, qo.content, qo.sort_order
     FROM question_options qo
     JOIN test_questions tq ON tq.question_id = qo.question_id
     WHERE tq.test_id = $1 ORDER BY qo.sort_order`,
    [row.test_id],
  );

  let questionRows = questions.rows;
  if (config.shuffleQuestions) {
    questionRows = seededShuffle(questionRows, `${attemptId}-questions`);
  }

  const mappedQuestions = questionRows.map((q) => {
    let opts = options.rows.filter((o) => o.question_id === q.question_id);
    if (config.shuffleOptions) {
      opts = seededShuffle(opts, `${attemptId}-${q.question_id}-options`);
    }
    return {
      ...q,
      options: opts.map((o) => ({ id: o.id, content: o.content, sort_order: o.sort_order })),
    };
  });

  const remainingSeconds = row.status === 'in_progress' ? getRemainingSeconds(startedAt, duration) : 0;

  return {
    id: row.id,
    test_id: row.test_id,
    student_id: row.student_id,
    status: row.status,
    started_at: row.started_at,
    submitted_at: row.submitted_at,
    title: row.title,
    test_title: row.title,
    duration_minutes: duration,
    instructions: row.instructions,
    passing_marks: row.passing_marks,
    config,
    ends_at: getEndsAt(startedAt, duration).toISOString(),
    remaining_seconds: remainingSeconds,
    tab_switch_count: countTabSwitches(row.proctoring_log),
    questions: mappedQuestions,
  };
}

export async function saveAnswer(
  attemptId: string,
  studentId: string,
  questionId: string,
  answer: Record<string, unknown>,
) {
  const row = await loadAttemptRow(attemptId, studentId);
  if (row.status !== 'in_progress') {
    throw new ConflictError('Attempt is not in progress');
  }

  const duration = Number(row.duration_minutes) || 60;
  if (isExpired(new Date(row.started_at), duration)) {
    await submitAttempt(attemptId, studentId, { autoSubmit: true });
    throw new ConflictError('Time expired — test was auto-submitted');
  }

  const inTest = await query(
    `SELECT 1 FROM test_questions WHERE test_id = $1 AND question_id = $2`,
    [row.test_id, questionId],
  );
  if (!inTest.rows[0]) throw new NotFoundError('Question');

  const result = await query(
    `INSERT INTO attempt_answers (attempt_id, question_id, answer, answered_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (attempt_id, question_id)
     DO UPDATE SET answer = EXCLUDED.answer, answered_at = NOW()
     RETURNING id, question_id, answer, answered_at`,
    [attemptId, questionId, JSON.stringify(answer)],
  );
  return result.rows[0];
}

export async function logProctoringEvent(
  attemptId: string,
  studentId: string,
  event: string,
  detail?: Record<string, unknown>,
) {
  const attempt = await query(
    `SELECT id, status, proctoring_log FROM test_attempts WHERE id = $1 AND student_id = $2`,
    [attemptId, studentId],
  );
  if (!attempt.rows[0]) throw new NotFoundError('Attempt');
  if (attempt.rows[0].status !== 'in_progress') {
    throw new ConflictError('Attempt is not in progress');
  }

  const log = Array.isArray(attempt.rows[0].proctoring_log) ? attempt.rows[0].proctoring_log : [];
  const entry = { event, detail: detail ?? {}, at: new Date().toISOString() };
  const updated = [...log, entry];

  await query(`UPDATE test_attempts SET proctoring_log = $2, updated_at = NOW() WHERE id = $1`, [
    attemptId,
    JSON.stringify(updated),
  ]);

  return { tab_switch_count: countTabSwitches(updated), log: entry };
}

export async function submitAttempt(
  attemptId: string,
  studentId: string,
  options?: { autoSubmit?: boolean },
) {
  const autoSubmit = options?.autoSubmit ?? false;

  return withTransaction(async (client) => {
    const attempt = await client.query(
      `SELECT ta.id, ta.test_id, ta.status, t.organization_id, t.config
       FROM test_attempts ta JOIN tests t ON t.id = ta.test_id
       WHERE ta.id = $1 AND ta.student_id = $2 FOR UPDATE`,
      [attemptId, studentId],
    );
    if (!attempt.rows[0]) throw new NotFoundError('Attempt');
    if (attempt.rows[0].status !== 'in_progress') {
      throw new ConflictError('Attempt already submitted');
    }

    const examConfig = parseExamConfig(attempt.rows[0].config);
    const defaultNegative = examConfig.negativeMarking ? 0.25 : 0;

    const answers = await client.query(
      `SELECT aa.question_id, aa.answer, q.type, q.marks, q.negative_marks
       FROM attempt_answers aa
       JOIN questions q ON q.id = aa.question_id
       WHERE aa.attempt_id = $1`,
      [attemptId],
    );

    let totalScore = 0;
    let maxScore = 0;
    let correct = 0;
    let total = 0;

    for (const row of answers.rows) {
      const marks = Number(row.marks);
      maxScore += marks;
      total += 1;

      const optionsResult = await client.query(
        `SELECT id, is_correct FROM question_options WHERE question_id = $1`,
        [row.question_id],
      );
      const correctIds = optionsResult.rows.filter((o) => o.is_correct).map((o) => o.id);
      const answer = row.answer as { selectedOptionIds?: string[] } | null;
      const selected = answer?.selectedOptionIds ?? [];

      let isCorrect = false;
      let marksAwarded = 0;

      if (row.type === 'mcq' || row.type === 'true_false') {
        isCorrect =
          selected.length === 1 &&
          correctIds.length === 1 &&
          selected[0] === correctIds[0];
      } else if (row.type === 'msq') {
        const selectedSet = new Set(selected);
        const correctSet = new Set(correctIds);
        isCorrect =
          selectedSet.size === correctSet.size &&
          [...correctSet].every((id) => selectedSet.has(id));
      } else if (row.type === 'fill_blank') {
        const ans = row.answer as { text?: string } | null;
        const correctOpt = optionsResult.rows.find((o) => o.is_correct);
        const expected = (correctOpt?.content as { text?: string })?.text?.trim().toLowerCase() ?? '';
        const given = ans?.text?.trim().toLowerCase() ?? '';
        isCorrect = expected.length > 0 && given === expected;
      } else if (row.type === 'integer' || row.type === 'numerical') {
        const ans = row.answer as { value?: number | string } | null;
        const correctOpt = optionsResult.rows.find((o) => o.is_correct);
        const expected = Number((correctOpt?.content as { value?: number })?.value);
        const given = Number(ans?.value);
        if (row.type === 'integer') {
          isCorrect = Number.isInteger(given) && given === expected;
        } else {
          isCorrect = !Number.isNaN(given) && !Number.isNaN(expected) && Math.abs(given - expected) < 0.01;
        }
      }

      if (isCorrect) {
        marksAwarded = marks;
        correct += 1;
      } else if (selected.length > 0 || row.type === 'fill_blank' || row.type === 'integer' || row.type === 'numerical') {
        const neg = Number(row.negative_marks) || defaultNegative;
        if (neg > 0) marksAwarded = -neg;
      }

      totalScore += marksAwarded;
      await client.query(
        `UPDATE attempt_answers SET is_correct = $3, marks_awarded = $4 WHERE attempt_id = $1 AND question_id = $2`,
        [attemptId, row.question_id, isCorrect, marksAwarded],
      );
    }

    const maxFromTest = await client.query(
      `SELECT COALESCE(total_marks, 0) AS total FROM tests WHERE id = $1`,
      [attempt.rows[0].test_id],
    );
    maxScore = Number(maxFromTest.rows[0]?.total) || maxScore;
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;

    const finalStatus = autoSubmit ? 'auto_submitted' : 'submitted';
    await client.query(
      `UPDATE test_attempts SET status = $2, submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [attemptId, finalStatus],
    );

    const result = await client.query(
      `INSERT INTO results (attempt_id, student_id, test_id, total_score, max_score, percentage, accuracy, analysis)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, total_score, max_score, percentage, accuracy, created_at`,
      [
        attemptId,
        studentId,
        attempt.rows[0].test_id,
        totalScore,
        maxScore,
        percentage,
        accuracy,
        JSON.stringify({ correct, total, autoSubmit }),
      ],
    );

    const testId = attempt.rows[0].test_id as string;
    const allResults = await client.query(
      `SELECT id, total_score FROM results WHERE test_id = $1 ORDER BY total_score DESC, created_at ASC`,
      [testId],
    );
    const rankTotal = allResults.rows.length;
    for (let i = 0; i < allResults.rows.length; i++) {
      const rank = i + 1;
      const percentile = rankTotal > 1 ? ((rankTotal - rank) / (rankTotal - 1)) * 100 : 100;
      await client.query(`UPDATE results SET rank = $2, percentile = $3 WHERE id = $1`, [
        allResults.rows[i].id,
        rank,
        percentile,
      ]);
    }

    const ranked = await client.query(
      `SELECT id, attempt_id, total_score, max_score, percentage, accuracy, rank, percentile, created_at
       FROM results WHERE attempt_id = $1`,
      [attemptId],
    );

    return ranked.rows[0] ?? result.rows[0];
  });
}

export async function getResultByAttemptId(attemptId: string, organizationId: string) {
  const result = await query(
    `SELECT r.id, r.attempt_id, r.student_id, r.test_id, r.total_score, r.max_score,
            r.percentage, r.accuracy, r.rank, r.percentile, r.analysis, r.created_at,
            t.title AS test_title, t.passing_marks, u.first_name, u.last_name
     FROM results r
     JOIN tests t ON t.id = r.test_id
     JOIN students s ON s.id = r.student_id
     JOIN users u ON u.id = s.user_id
     WHERE r.attempt_id = $1 AND t.organization_id = $2`,
    [attemptId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Result');
  return result.rows[0];
}

export async function listAttempts(
  organizationId: string,
  page: number,
  limit: number,
  filters?: { testId?: string; studentId?: string },
) {
  const offset = (page - 1) * limit;
  const params: unknown[] = [organizationId];
  let where = 't.organization_id = $1';
  if (filters?.testId) {
    params.push(filters.testId);
    where += ` AND ta.test_id = $${params.length}`;
  }
  if (filters?.studentId) {
    params.push(filters.studentId);
    where += ` AND ta.student_id = $${params.length}`;
  }
  params.push(limit, offset);

  const [data, count] = await Promise.all([
    query(
      `SELECT ta.id, ta.test_id, ta.student_id, ta.status, ta.started_at, ta.submitted_at,
              t.title AS test_title, u.first_name, u.last_name, u.email,
              r.total_score, r.max_score, r.percentage, r.attempt_id AS result_attempt_id
       FROM test_attempts ta
       JOIN tests t ON t.id = ta.test_id
       JOIN students s ON s.id = ta.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN results r ON r.attempt_id = ta.id
       WHERE ${where}
       ORDER BY ta.started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE ${where}`,
      params.slice(0, -2),
    ),
  ]);
  const total = count.rows[0].total as number;
  return {
    data: data.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  } satisfies PaginatedResult<unknown>;
}

export async function listStudentResults(studentId: string, organizationId: string) {
  const result = await query(
    `SELECT r.id, r.attempt_id, r.test_id, r.total_score, r.max_score, r.percentage,
            r.accuracy, r.rank, r.percentile, r.created_at, t.title AS test_title, t.passing_marks
     FROM results r
     JOIN tests t ON t.id = r.test_id
     WHERE r.student_id = $1 AND t.organization_id = $2
     ORDER BY r.created_at DESC`,
    [studentId, organizationId],
  );
  return result.rows;
}

export async function getStudentStats(studentId: string, organizationId: string) {
  const result = await query(
    `SELECT
       (SELECT COUNT(DISTINCT t.id)::int
        FROM test_assignments ta JOIN tests t ON t.id = ta.test_id
        WHERE ta.assignee_type = 'student' AND ta.assignee_id = $1
          AND t.organization_id = $2 AND t.status = 'live') AS assigned_tests,
       (SELECT COUNT(*)::int FROM test_attempts ta
        JOIN tests t ON t.id = ta.test_id
        WHERE ta.student_id = $1 AND t.organization_id = $2) AS attempts,
       (SELECT COUNT(*)::int FROM results r
        JOIN tests t ON t.id = r.test_id
        WHERE r.student_id = $1 AND t.organization_id = $2) AS results,
       (SELECT COUNT(*)::int FROM test_attempts ta
        JOIN tests t ON t.id = ta.test_id
        WHERE ta.student_id = $1 AND t.organization_id = $2 AND ta.status = 'in_progress') AS in_progress`,
    [studentId, organizationId],
  );
  return result.rows[0];
}
