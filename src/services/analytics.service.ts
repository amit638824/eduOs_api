import { query } from '../config/database.js';

export async function getOrganizationStats(organizationId: string) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM students WHERE organization_id = $1) AS students,
       (SELECT COUNT(*)::int FROM teachers WHERE organization_id = $1) AS teachers,
       (SELECT COUNT(*)::int FROM questions WHERE organization_id = $1 AND archived_at IS NULL) AS questions,
       (SELECT COUNT(*)::int FROM tests WHERE organization_id = $1 AND archived_at IS NULL) AS tests,
       (SELECT COUNT(*)::int FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE t.organization_id = $1) AS attempts,
       (SELECT COUNT(*)::int FROM results r JOIN tests t ON t.id = r.test_id WHERE t.organization_id = $1) AS results,
       (SELECT COUNT(*)::int FROM branches WHERE organization_id = $1 AND deleted_at IS NULL) AS branches`,
    [organizationId],
  );
  return result.rows[0];
}

export async function getTestAnalytics(testId: string, organizationId: string) {
  const test = await query(
    `SELECT id, title FROM tests WHERE id = $1 AND organization_id = $2`,
    [testId, organizationId],
  );
  if (!test.rows[0]) return null;

  const stats = await query(
    `SELECT
       COUNT(ta.id)::int AS total_attempts,
       COUNT(r.id)::int AS completed,
       COALESCE(AVG(r.percentage), 0)::numeric(5,2) AS avg_percentage,
       COALESCE(MAX(r.percentage), 0)::numeric(5,2) AS highest_score,
       COALESCE(MIN(r.percentage), 0)::numeric(5,2) AS lowest_score
     FROM test_attempts ta
     LEFT JOIN results r ON r.attempt_id = ta.id
     WHERE ta.test_id = $1`,
    [testId],
  );

  return { test: test.rows[0], stats: stats.rows[0] };
}
