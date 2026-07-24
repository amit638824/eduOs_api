import { query } from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { applyRanksForTest } from './ranking.service.js';

export async function getTestReport(testId: string, organizationId: string) {
  const test = await query(
    `SELECT id, title, total_marks, status FROM tests WHERE id = $1 AND organization_id = $2`,
    [testId, organizationId],
  );
  if (!test.rows[0]) throw new NotFoundError('Test');

  const attempts = await query(
    `SELECT r.id, r.student_id, r.total_score, r.max_score, r.percentage, r.accuracy,
            r.rank, r.percentile, r.created_at, u.first_name, u.last_name, u.email
     FROM results r
     JOIN students s ON s.id = r.student_id
     JOIN users u ON u.id = s.user_id
     WHERE r.test_id = $1
     ORDER BY r.total_score DESC, r.created_at ASC`,
    [testId],
  );

  const stats = await query(
    `SELECT
       COUNT(*)::int AS attempt_count,
       COALESCE(AVG(total_score), 0) AS avg_score,
       COALESCE(MAX(total_score), 0) AS max_score,
       COALESCE(MIN(total_score), 0) AS min_score
     FROM results WHERE test_id = $1`,
    [testId],
  );

  return {
    test: test.rows[0],
    stats: stats.rows[0],
    results: attempts.rows,
  };
}

export async function exportTestReportCsv(testId: string, organizationId: string): Promise<string> {
  const report = await getTestReport(testId, organizationId);
  const headers = ['Rank', 'Student', 'Email', 'Score', 'Max', 'Percentage', 'Accuracy', 'Submitted'];
  const rows = report.results.map((r, i) => [
    String(r.rank ?? i + 1),
    `${r.first_name} ${r.last_name}`,
    r.email,
    String(r.total_score),
    String(r.max_score),
    String(Number(r.percentage).toFixed(2)),
    String(Number(r.accuracy).toFixed(2)),
    formatCsvDate(r.created_at as string | Date),
  ]);
  return [headers.join(','), ...rows.map((row) => row.map((c) => `"${c}"`).join(','))].join('\n');
}

/** e.g. 17 July 2026 */
function formatCsvDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'long' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
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
  const [users, tests, attempts, payments] = await Promise.all([
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
  ]);
  return {
    users: users.rows[0].count,
    tests: tests.rows[0].count,
    attempts: attempts.rows[0].count,
    revenue: payments.rows[0].total,
  };
}
