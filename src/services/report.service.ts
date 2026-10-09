import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { applyRanksForTest } from './ranking.service.js';
import { formatDateTime } from '../utils/dateFormat.js';
import { buildTestReportPdf } from './certificate.service.js';

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function getTestReport(testId: string, organizationId: string) {
  const test = await query(
    `SELECT id, title, total_marks, status, passing_marks FROM tests WHERE id = $1 AND organization_id = $2`,
    [testId, organizationId],
  );
  if (!test.rows[0]) throw new NotFoundError('Test');

  const attempts = await query(
    `SELECT r.id AS result_id, r.attempt_id, r.student_id, r.total_score, r.max_score, r.percentage, r.accuracy,
            r.rank, r.percentile, r.created_at, u.first_name, u.last_name, u.email,
            s.admission_no AS enrollment_no,
            c.id AS certificate_id, c.certificate_no, c.status AS certificate_status
     FROM results r
     JOIN students s ON s.id = r.student_id
     JOIN users u ON u.id = s.user_id
     LEFT JOIN certificates c ON c.result_id = r.id AND c.status = 'issued'
     WHERE r.test_id = $1
     ORDER BY r.total_score DESC, r.created_at ASC`,
    [testId],
  );

  const stats = await query(
    `SELECT
       COUNT(*)::int AS attempt_count,
       COALESCE(AVG(total_score), 0) AS avg_score,
       COALESCE(MAX(total_score), 0) AS max_score,
       COALESCE(MIN(total_score), 0) AS min_score,
       COALESCE(AVG(percentage), 0) AS avg_percentage
     FROM results WHERE test_id = $1`,
    [testId],
  );

  const passingMarks = Number(test.rows[0].passing_marks ?? 0);
  let passed = 0;
  for (const r of attempts.rows) {
    const score = Number(r.total_score);
    const pct = Number(r.percentage);
    if (passingMarks > 0 ? score >= passingMarks : pct >= 40) passed += 1;
  }
  const graded = attempts.rows.length;
  const passRate = graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0;

  return {
    test: test.rows[0],
    stats: {
      ...stats.rows[0],
      passed,
      pass_rate: passRate,
    },
    results: attempts.rows,
  };
}

export async function exportTestReportCsv(testId: string, organizationId: string): Promise<string> {
  const report = await getTestReport(testId, organizationId);
  const headers = [
    'Rank',
    'Enrollment No',
    'Student',
    'Email',
    'Score',
    'Max',
    'Percentage',
    'Accuracy',
    'Certificate No',
    'Submitted',
  ];
  const rows = report.results.map((r, i) => [
    String(r.rank ?? i + 1),
    r.enrollment_no ?? '',
    `${r.first_name} ${r.last_name}`,
    r.email,
    String(r.total_score),
    String(r.max_score),
    String(Number(r.percentage).toFixed(2)),
    String(Number(r.accuracy).toFixed(2)),
    r.certificate_no ?? '',
    formatDateTime(r.created_at as string | Date),
  ]);
  const body = [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  // UTF-8 BOM helps Excel open Hindi/special characters correctly
  return `\uFEFF${body}`;
}

export async function exportTestReportPdf(testId: string, organizationId: string): Promise<Buffer> {
  const report = await getTestReport(testId, organizationId);
  const org = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1`,
    [organizationId],
  );
  return buildTestReportPdf({
    testTitle: String(report.test.title),
    orgName: org.rows[0]?.name,
    stats: report.stats as Record<string, unknown>,
    results: report.results as Array<Record<string, unknown>>,
  });
}

export async function computeRanksForTest(testId: string, organizationId: string) {
  const test = await query(`SELECT id FROM tests WHERE id = $1 AND organization_id = $2`, [
    testId,
    organizationId,
  ]);
  if (!test.rows[0]) throw new NotFoundError('Test');

  const count = await applyRanksForTest(testId);
  return { message: 'Ranks computed', count };
}

export async function getOrgOverviewReport(organizationId: string) {
  const [users, tests, attempts, payments, assignments, certificates, pass] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM users WHERE organization_id = $1 AND deleted_at IS NULL`, [
      organizationId,
    ]),
    query(`SELECT COUNT(*)::int AS count FROM tests WHERE organization_id = $1`, [organizationId]),
    query(
      `SELECT COUNT(*)::int AS count FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE t.organization_id = $1`,
      [organizationId],
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE organization_id = $1 AND status = 'completed'`,
      [organizationId],
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM test_assignments ta
       JOIN tests t ON t.id = ta.test_id
       WHERE t.organization_id = $1 AND ta.assignee_type = 'student'`,
      [organizationId],
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM certificates WHERE organization_id = $1 AND status = 'issued'`,
      [organizationId],
    ),
    query(
      `SELECT
         COUNT(*)::int AS graded,
         SUM(
           CASE
             WHEN t.passing_marks IS NOT NULL AND t.passing_marks > 0 AND r.total_score >= t.passing_marks THEN 1
             WHEN (t.passing_marks IS NULL OR t.passing_marks = 0) AND r.percentage >= 40 THEN 1
             ELSE 0
           END
         )::int AS passed
       FROM results r
       JOIN tests t ON t.id = r.test_id
       WHERE t.organization_id = $1`,
      [organizationId],
    ),
  ]);

  const graded = Number(pass.rows[0]?.graded ?? 0);
  const passed = Number(pass.rows[0]?.passed ?? 0);

  return {
    users: users.rows[0].count,
    tests: tests.rows[0].count,
    attempts: attempts.rows[0].count,
    revenue: payments.rows[0].total,
    assignments: assignments.rows[0].count,
    certificates: certificates.rows[0].count,
    pass_rate: graded > 0 ? Number(((passed / graded) * 100).toFixed(1)) : 0,
  };
}
