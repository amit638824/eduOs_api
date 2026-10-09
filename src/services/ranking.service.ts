import { query } from '../config/database.js';

type ResultRow = { id: string; total_score: number };

type DbQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** Competition rank (ties share rank; next rank skips). */
export function computeRankAndPercentile(rows: ResultRow[]) {
  if (rows.length === 0) return [];

  const n = rows.length;
  const scores = rows.map((r) => Number(r.total_score));
  const sorted = [...rows].sort((a, b) => Number(b.total_score) - Number(a.total_score));

  const rankById = new Map<string, number>();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && Number(sorted[i].total_score) < Number(sorted[i - 1].total_score)) {
      rank = i + 1;
    }
    rankById.set(sorted[i].id, rank);
  }

  return rows.map((row) => {
    const myScore = Number(row.total_score);
    const below = scores.filter((s) => s < myScore).length;
    const percentile = n > 1 ? (below / (n - 1)) * 100 : 100;
    return {
      id: row.id,
      rank: rankById.get(row.id) ?? n,
      percentile,
    };
  });
}

/** Recompute rank + score-based percentile for all results on a test. */
export async function applyRanksForTest(testId: string, runQuery: DbQuery = query) {
  const results = await runQuery(
    `SELECT id, total_score FROM results WHERE test_id = $1 ORDER BY total_score DESC, created_at ASC`,
    [testId],
  );
  const computed = computeRankAndPercentile(results.rows as ResultRow[]);
  for (const row of computed) {
    await runQuery(`UPDATE results SET rank = $2, percentile = $3 WHERE id = $1`, [
      row.id,
      row.rank,
      row.percentile,
    ]);
  }
  return computed.length;
}
