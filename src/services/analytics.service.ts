import { query } from '../config/database.js';

export async function getOrganizationStats(organizationId: string) {
  const [core, passRate, buckets, recent, certificates] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM students WHERE organization_id = $1) AS students,
         (SELECT COUNT(*)::int FROM teachers WHERE organization_id = $1) AS teachers,
         (SELECT COUNT(*)::int FROM questions WHERE organization_id = $1 AND archived_at IS NULL) AS questions,
         (SELECT COUNT(*)::int FROM tests WHERE organization_id = $1 AND archived_at IS NULL) AS tests,
         (SELECT COUNT(*)::int FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE t.organization_id = $1) AS attempts,
         (SELECT COUNT(*)::int FROM results r JOIN tests t ON t.id = r.test_id WHERE t.organization_id = $1) AS results,
         (SELECT COUNT(*)::int FROM branches WHERE organization_id = $1 AND deleted_at IS NULL) AS branches,
         (SELECT COUNT(*)::int FROM test_assignments ta
            JOIN tests t ON t.id = ta.test_id
           WHERE t.organization_id = $1 AND ta.assignee_type = 'student') AS assignments`,
      [organizationId],
    ),
    query(
      `SELECT
         COUNT(*)::int AS graded,
         SUM(
           CASE
             WHEN t.passing_marks IS NOT NULL AND t.passing_marks > 0 AND r.max_score > 0
               AND r.total_score >= t.passing_marks THEN 1
             WHEN (t.passing_marks IS NULL OR t.passing_marks = 0) AND r.percentage >= 40 THEN 1
             ELSE 0
           END
         )::int AS passed
       FROM results r
       JOIN tests t ON t.id = r.test_id
       WHERE t.organization_id = $1`,
      [organizationId],
    ),
    query(
      `SELECT
         SUM(CASE WHEN r.percentage < 40 THEN 1 ELSE 0 END)::int AS below_40,
         SUM(CASE WHEN r.percentage >= 40 AND r.percentage < 60 THEN 1 ELSE 0 END)::int AS from_40_60,
         SUM(CASE WHEN r.percentage >= 60 AND r.percentage < 80 THEN 1 ELSE 0 END)::int AS from_60_80,
         SUM(CASE WHEN r.percentage >= 80 THEN 1 ELSE 0 END)::int AS above_80
       FROM results r
       JOIN tests t ON t.id = r.test_id
       WHERE t.organization_id = $1`,
      [organizationId],
    ),
    query(
      `SELECT t.id, t.title, t.status,
              COUNT(DISTINCT ta.id)::int AS attempt_count,
              COUNT(DISTINCT r.id)::int AS result_count,
              COALESCE(AVG(r.percentage), 0) AS avg_percentage
       FROM tests t
       LEFT JOIN test_attempts ta ON ta.test_id = t.id
       LEFT JOIN results r ON r.test_id = t.id
       WHERE t.organization_id = $1 AND t.archived_at IS NULL
       GROUP BY t.id, t.title, t.status, t.created_at
       ORDER BY t.created_at DESC
       LIMIT 8`,
      [organizationId],
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM certificates
       WHERE organization_id = $1 AND status = 'issued'`,
      [organizationId],
    ),
  ]);

  const graded = Number(passRate.rows[0]?.graded ?? 0);
  const passed = Number(passRate.rows[0]?.passed ?? 0);

  return {
    ...core.rows[0],
    certificates_issued: certificates.rows[0]?.count ?? 0,
    pass_rate: graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0,
    score_distribution: buckets.rows[0] ?? {
      below_40: 0,
      from_40_60: 0,
      from_60_80: 0,
      above_80: 0,
    },
    recent_tests: recent.rows,
  };
}

export async function getTestAnalytics(testId: string, organizationId: string) {
  const test = await query(
    `SELECT id, title, passing_marks, total_marks FROM tests WHERE id = $1 AND organization_id = $2`,
    [testId, organizationId],
  );
  if (!test.rows[0]) return null;

  const stats = await query(
    `SELECT
       COUNT(ta.id)::int AS total_attempts,
       COUNT(r.id)::int AS completed,
       COALESCE(AVG(r.percentage), 0)::numeric(5,2) AS avg_percentage,
       COALESCE(MAX(r.percentage), 0)::numeric(5,2) AS highest_score,
       COALESCE(MIN(r.percentage), 0)::numeric(5,2) AS lowest_score,
       COALESCE(AVG(r.accuracy), 0)::numeric(5,2) AS avg_accuracy
     FROM test_attempts ta
     LEFT JOIN results r ON r.attempt_id = ta.id
     WHERE ta.test_id = $1`,
    [testId],
  );

  const pass = await query(
    `SELECT
       COUNT(*)::int AS graded,
       SUM(
         CASE
           WHEN $2 > 0 AND r.total_score >= $2 THEN 1
           WHEN ($2 IS NULL OR $2 = 0) AND r.percentage >= 40 THEN 1
           ELSE 0
         END
       )::int AS passed
     FROM results r WHERE r.test_id = $1`,
    [testId, test.rows[0].passing_marks ?? 0],
  );

  const distribution = await query(
    `SELECT
       SUM(CASE WHEN percentage < 40 THEN 1 ELSE 0 END)::int AS below_40,
       SUM(CASE WHEN percentage >= 40 AND percentage < 60 THEN 1 ELSE 0 END)::int AS from_40_60,
       SUM(CASE WHEN percentage >= 60 AND percentage < 80 THEN 1 ELSE 0 END)::int AS from_60_80,
       SUM(CASE WHEN percentage >= 80 THEN 1 ELSE 0 END)::int AS above_80
     FROM results WHERE test_id = $1`,
    [testId],
  );

  const graded = Number(pass.rows[0]?.graded ?? 0);
  const passed = Number(pass.rows[0]?.passed ?? 0);

  return {
    test: test.rows[0],
    stats: {
      ...stats.rows[0],
      pass_rate: graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0,
      passed,
      graded,
      score_distribution: distribution.rows[0],
    },
  };
}

/**
 * Question-level analytics for a test: correct %, avg time, distractors, hard questions.
 */
export async function getTestQuestionAnalytics(testId: string, organizationId: string) {
  const test = await query(
    `SELECT id, title FROM tests WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`,
    [testId, organizationId],
  );
  if (!test.rows[0]) return null;

  const questions = await query(
    `SELECT
       q.id AS question_id,
       q.type,
       q.content,
       q.difficulty,
       COALESCE(tq.marks_override, q.marks) AS marks,
       tq.sort_order,
       COUNT(aa.id)::int AS answered_count,
       SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END)::int AS correct_count,
       COALESCE(AVG(NULLIF(aa.time_spent_sec, 0)), 0) AS avg_time_sec
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     LEFT JOIN attempt_answers aa ON aa.question_id = q.id
       AND aa.attempt_id IN (
         SELECT ta.id FROM test_attempts ta
         WHERE ta.test_id = $1 AND ta.status IN ('submitted', 'auto_submitted')
       )
     WHERE tq.test_id = $1
     GROUP BY q.id, q.type, q.content, q.difficulty, tq.marks_override, q.marks, tq.sort_order
     ORDER BY tq.sort_order, q.id`,
    [testId],
  );

  const options = await query(
    `SELECT qo.id, qo.question_id, qo.content, qo.is_correct, qo.sort_order
     FROM question_options qo
     JOIN test_questions tq ON tq.question_id = qo.question_id
     WHERE tq.test_id = $1
     ORDER BY qo.question_id, qo.sort_order, qo.id`,
    [testId],
  );

  const answers = await query(
    `SELECT aa.question_id, aa.answer
     FROM attempt_answers aa
     JOIN test_attempts ta ON ta.id = aa.attempt_id
     WHERE ta.test_id = $1 AND ta.status IN ('submitted', 'auto_submitted')`,
    [testId],
  );

  const pickCounts = new Map<string, Map<string, number>>();
  for (const row of answers.rows) {
    const ans = typeof row.answer === 'string' ? (() => { try { return JSON.parse(row.answer as string); } catch { return {}; } })() : row.answer;
    const selected = (ans as { selectedOptionIds?: string[] })?.selectedOptionIds ?? [];
    const qid = String(row.question_id);
    if (!pickCounts.has(qid)) pickCounts.set(qid, new Map());
    const m = pickCounts.get(qid)!;
    for (const oid of selected) {
      m.set(oid, (m.get(oid) ?? 0) + 1);
    }
  }

  const optionsByQ = new Map<string, typeof options.rows>();
  for (const opt of options.rows) {
    const qid = String(opt.question_id);
    const list = optionsByQ.get(qid) ?? [];
    list.push(opt);
    optionsByQ.set(qid, list);
  }

  const { parseJsonField } = await import('../utils/json.js');

  const items = questions.rows.map((q) => {
    const answered = Number(q.answered_count ?? 0);
    const correct = Number(q.correct_count ?? 0);
    const correctPct = answered > 0 ? Number(((correct / answered) * 100).toFixed(1)) : null;
    const qOpts = optionsByQ.get(String(q.question_id)) ?? [];
    const picks = pickCounts.get(String(q.question_id)) ?? new Map();
    const distractors = qOpts.map((o) => {
      const count = picks.get(String(o.id)) ?? 0;
      return {
        option_id: o.id,
        content: parseJsonField(o.content) ?? o.content,
        is_correct: o.is_correct === true || o.is_correct === 1 || o.is_correct === '1',
        selected_count: count,
        selected_pct: answered > 0 ? Number(((count / answered) * 100).toFixed(1)) : 0,
      };
    });

    let text = '';
    const content = parseJsonField(q.content) ?? q.content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      text = String((content as { text?: string }).text ?? '');
    } else if (typeof content === 'string') {
      text = content;
    }

    return {
      question_id: q.question_id,
      type: q.type,
      text: text.slice(0, 200),
      difficulty: q.difficulty,
      marks: q.marks,
      sort_order: q.sort_order,
      answered_count: answered,
      correct_count: correct,
      correct_pct: correctPct,
      avg_time_sec: Number(Number(q.avg_time_sec ?? 0).toFixed(1)),
      distractors,
    };
  });

  const hardQuestions = [...items]
    .filter((i) => i.answered_count >= 1 && i.correct_pct != null)
    .sort((a, b) => (a.correct_pct ?? 100) - (b.correct_pct ?? 100))
    .slice(0, 10);

  return {
    test: test.rows[0],
    questions: items,
    hard_questions: hardQuestions,
  };
}
