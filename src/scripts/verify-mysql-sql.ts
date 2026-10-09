/**
 * Compile every representative API SQL string to MySQL and fail if Postgres leftovers remain.
 * Run: npx tsx src/scripts/verify-mysql-sql.ts
 */
import { compileMysqlSql } from '../config/database.js';

const PG_LEFTOVERS =
  /\bILIKE\b|\bRETURNING\b|\bON CONFLICT\b|\bEXCLUDED\b|\bFILTER\s*\(|\bDISTINCT ON\b|\bLATERAL\b|::[a-z]|INTERVAL\s+'|NOW\(\)\s*\+/i;

/** MariaDB < 10.5 does not support these (XAMPP common case). */
const MARIADB_UNSAFE =
  /\bJSON_ARRAYAGG\b|\bJSON_OBJECTAGG\b|\bCAST\s*\([^)]*\s+AS\s+JSON\s*\)|\bJSON_ARRAY\s*\(\s*\)/i;

const samples: { name: string; sql: string; params?: unknown[] }[] = [
  {
    name: 'interval days',
    sql: `INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at)
          VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
    params: ['id', 'u', 'h', '{}', null],
  },
  {
    name: 'interval hour',
    sql: `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    params: ['u', 'h'],
  },
  {
    name: 'interval minutes',
    sql: `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
          VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
    params: ['u', 'h', 'login'],
  },
  {
    name: 'ilike search',
    sql: `SELECT id FROM users WHERE email ILIKE $1 OR first_name ILIKE $1`,
    params: ['%a%'],
  },
  {
    name: 'count cast',
    sql: `SELECT COUNT(*)::int AS total FROM users WHERE organization_id = $1`,
    params: ['org'],
  },
  {
    name: 'on conflict do nothing',
    sql: `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    params: ['u', 'r'],
  },
  {
    name: 'on conflict upsert',
    sql: `INSERT INTO attempt_answers (attempt_id, question_id, answer, answered_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (attempt_id, question_id)
          DO UPDATE SET answer = EXCLUDED.answer, answered_at = NOW()
          RETURNING id, question_id, answer, answered_at`,
    params: ['a', 'q', '{}'],
  },
  {
    name: 'multiline returning insert',
    sql: `INSERT INTO test_attempts (
       test_id,
       student_id,
       status
     )
     VALUES (
       $1,
       $2,
       'in_progress'
     )
     RETURNING
       id,
       test_id,
       student_id,
       status,
       started_at`,
    params: ['t', 's'],
  },
  {
    name: 'nulls last order rewrite',
    sql: `SELECT id FROM test_assignments
     WHERE test_id = $1 AND assignee_type = 'student' AND assignee_id = $2
     ORDER BY (scheduled_at IS NULL), scheduled_at DESC
     LIMIT 1`,
    params: ['t', 's'],
  },
  {
    name: 'settings upsert',
    sql: `INSERT INTO settings (organization_id, \`key\`, value)
          VALUES ($1, $2, $3)
          ON CONFLICT (organization_id, \`key\`)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
          RETURNING id, organization_id, \`key\`, value, updated_at`,
    params: ['org', 'k', '{}'],
  },
  {
    name: 'json merge',
    sql: `UPDATE payments SET metadata = metadata || $2::jsonb, updated_at = NOW() WHERE id = $1`,
    params: ['id', '{"a":1}'],
  },
  {
    name: 'empty json array fallback',
    sql: `SELECT COALESCE(JSON_ARRAY(), '[]') AS roles`,
  },
  {
    name: 'cast as json strip',
    sql: `SELECT CAST(content AS JSON) AS content FROM questions WHERE id = $1`,
    params: ['q'],
  },
  {
    name: 'status cast',
    sql: `UPDATE tests SET status = $3::test_status, scheduled_start = $4::timestamptz
          WHERE id = $1 AND organization_id = $2 AND status IN ('draft', 'scheduled')
          RETURNING id, status`,
    params: ['t', 'org', 'live', null],
  },
  {
    name: 'boolean cast',
    sql: `UPDATE organizations SET is_active = CASE WHEN $2::boolean IS NULL THEN is_active ELSE $2::boolean END WHERE id = $1`,
    params: ['id', true],
  },
  {
    name: 'otp consume returning',
    sql: `UPDATE otp_codes SET used_at = NOW()
          WHERE user_id = $1 AND purpose = $2 AND code_hash = $3
            AND used_at IS NULL AND expires_at > NOW()
          RETURNING id`,
    params: ['u', 'p', 'h'],
  },
  {
    name: 'rank column',
    sql: `UPDATE results SET rank = $2, percentile = $3 WHERE id = $1`,
    params: ['id', 1, 99.5],
  },
  {
    name: 'select rank',
    sql: `SELECT r.id, r.rank, r.percentile FROM results r WHERE r.test_id = $1 ORDER BY r.rank`,
    params: ['t'],
  },
  {
    name: 'uuid null check',
    sql: `UPDATE refresh_tokens SET revoked_at = NOW()
          WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)`,
    params: ['u', null],
  },
  {
    name: 'numeric percent',
    sql: `UPDATE results SET percentage = CASE WHEN $2::numeric > 0 THEN (total_score / $2::numeric) * 100 ELSE 0 END WHERE test_id = $1`,
    params: ['t', 10],
  },
  {
    name: 'key in list',
    sql: `SELECT id, \`key\`, value FROM settings WHERE organization_id = $1 AND \`key\` IN ($2, $3)`,
    params: ['org', 'a', 'b'],
  },
  {
    name: 'json array param',
    sql: `UPDATE test_attempts SET proctoring_log = $2 WHERE id = $1`,
    params: ['id', [{ event: 'tab_switch' }]],
  },
];

let failed = 0;
for (const sample of samples) {
  const compiled = compileMysqlSql(sample.sql, sample.params);
  const leftover = PG_LEFTOVERS.exec(compiled.sql);
  const mariadbUnsafe = MARIADB_UNSAFE.exec(compiled.sql);
  const okInterval =
    !sample.name.startsWith('interval') || /DATE_ADD\(NOW\(\), INTERVAL \d+ (DAY|HOUR|MINUTE)\)/.test(compiled.sql);
  const okIgnore = sample.name !== 'on conflict do nothing' || /INSERT IGNORE INTO/i.test(compiled.sql);
  const okDup = !sample.name.includes('upsert') || /ON DUPLICATE KEY UPDATE/i.test(compiled.sql);
  const okJson =
    sample.name !== 'json merge' ||
    (/JSON_MERGE_PATCH/i.test(compiled.sql) && !/CAST\s*\(.*AS\s+JSON/i.test(compiled.sql));
  const okRank = !sample.name.includes('rank') || compiled.sql.includes('`rank`');
  const okEmptyArr =
    sample.name !== 'empty json array fallback' || !/\bJSON_ARRAY\s*\(/i.test(compiled.sql);
  const okCastJson =
    sample.name !== 'cast as json strip' || !/\bCAST\s*\(.*AS\s+JSON/i.test(compiled.sql);
  const okArrParam =
    sample.name !== 'json array param' ||
    compiled.params.some(
      (p) => typeof p === 'string' && String(p).includes('tab_switch'),
    );

  if (
    leftover ||
    mariadbUnsafe ||
    !okInterval ||
    !okIgnore ||
    !okDup ||
    !okJson ||
    !okRank ||
    !okEmptyArr ||
    !okCastJson ||
    !okArrParam
  ) {
    failed += 1;
    console.error(`FAIL ${sample.name}`);
    console.error('  sql:', compiled.sql.replace(/\s+/g, ' ').trim());
    if (leftover) console.error('  leftover:', leftover[0]);
    if (mariadbUnsafe) console.error('  mariadb-unsafe:', mariadbUnsafe[0]);
  } else {
    console.log(`ok   ${sample.name}`);
    if (
      sample.name.startsWith('interval') ||
      sample.name.includes('conflict') ||
      sample.name === 'json merge' ||
      sample.name.startsWith('empty') ||
      sample.name.startsWith('cast') ||
      sample.name === 'json array param'
    ) {
      console.log('     ', compiled.sql.replace(/\s+/g, ' ').trim());
      if (sample.name === 'json array param') console.log('     ', compiled.params);
    }
  }
}

if (failed) {
  console.error(`\n${failed} MySQL SQL check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${samples.length} compiled queries are MySQL-safe.`);
