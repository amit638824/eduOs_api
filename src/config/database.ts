import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { env } from './env.js';

export type DbRow = { [key: string]: any };

export interface QueryResult<T extends DbRow = DbRow> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T extends DbRow = DbRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

function sslOption(): mysql.SslOptions | undefined {
  if (!env.DB_SSL) return undefined;
  return { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED };
}

function baseConnConfig() {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    charset: 'utf8mb4',
    timezone: 'Z' as const,
    dateStrings: false as const,
    multipleStatements: true,
    ssl: sslOption(),
    decimalNumbers: true,
    supportBigNumbers: true,
    typeCast(field: { type: string; length: number; string: () => string | null }, next: () => unknown) {
      if (field.type === 'TINY' && field.length === 1) {
        const value = field.string();
        if (value === null) return null;
        return value === '1';
      }
      return next();
    },
  };
}

export const pool: Pool = mysql.createPool({
  ...baseConnConfig(),
  database: env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: env.DB_POOL_MAX,
  maxIdle: env.DB_POOL_MAX,
  idleTimeout: env.DB_IDLE_TIMEOUT_MS,
  connectTimeout: env.DB_CONNECTION_TIMEOUT_MS,
  queueLimit: 0,
  enableKeepAlive: true,
});

function prepareParams(params: unknown[] = []): unknown[] {
  return params.map((value) => {
    if (value === undefined) return null;
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value);
    }
    return value;
  });
}

function convertPgParams(sql: string, params: unknown[] = []): { sql: string; params: unknown[] } {
  const used: unknown[] = [];
  const converted = sql.replace(/\$(\d+)/g, (_, n: string) => {
    used.push(params[Number(n) - 1]);
    return '?';
  });
  return { sql: converted, params: prepareParams(used) };
}

const MYSQL_INTERVAL_UNIT: Record<string, string> = {
  second: 'SECOND',
  seconds: 'SECOND',
  minute: 'MINUTE',
  minutes: 'MINUTE',
  hour: 'HOUR',
  hours: 'HOUR',
  day: 'DAY',
  days: 'DAY',
  week: 'WEEK',
  weeks: 'WEEK',
  month: 'MONTH',
  months: 'MONTH',
  year: 'YEAR',
  years: 'YEAR',
};

function translatePgSyntax(sql: string): string {
  let s = sql;
  s = s.replace(/NOW\(\)\s*\+\s*INTERVAL\s+'(\d+)\s+(\w+)'/gi, (_m, n: string, unit: string) => {
    const mapped = MYSQL_INTERVAL_UNIT[unit.toLowerCase()] ?? unit.toUpperCase();
    return `DATE_ADD(NOW(), INTERVAL ${n} ${mapped})`;
  });
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  s = s.replace(/::numeric\(\d+\s*,\s*\d+\)/gi, '');
  s = s.replace(
    /::(?:int|integer|text|uuid|boolean|jsonb|json|timestamptz|test_status|numeric)\b/gi,
    '',
  );
  s = s.replace(/(\w+)\s*\|\|\s*(\$\d+)/g, (_m, col: string, placeholder: string) => {
    // Avoid CAST(... AS JSON) — unsupported on MariaDB < 10.5
    return `JSON_MERGE_PATCH(IFNULL(${col}, '{}'), ${placeholder})`;
  });
  // MariaDB < 10.5: JSON_ARRAY() / CAST(x AS JSON) are unavailable or limited
  s = s.replace(/\bJSON_ARRAY\s*\(\s*\)/gi, `'[]'`);
  s = s.replace(/\bCAST\s*\(([^()]+|\([^()]*\))\s+AS\s+JSON\s*\)/gi, '$1');
  s = s.replace(/(?<![`])\brank\b(?![`\w])/gi, '`rank`');
  return s;
}

function translateOnConflict(sql: string): string {
  let s = sql;
  s = s.replace(/ON CONFLICT\s*\([^)]+\)\s*DO UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
  s = s.replace(/\bEXCLUDED\.(\w+)/gi, 'VALUES($1)');
  s = s.replace(/ON CONFLICT\s*\(([^)]+)\)\s*DO NOTHING/gi, (_m, cols: string) => {
    const first = cols.split(',')[0].trim().replace(/`/g, '');
    return `ON DUPLICATE KEY UPDATE \`${first}\` = \`${first}\``;
  });
  if (/ON CONFLICT\s+DO NOTHING/i.test(s)) {
    s = s.replace(/ON CONFLICT\s+DO NOTHING/gi, '');
    s = s.replace(/INSERT\s+INTO/i, 'INSERT IGNORE INTO');
  }
  return s;
}

/** Compile a query to MySQL SQL (no execute) — used to catch leftover Postgres syntax. */
export function compileMysqlSql(
  sql: string,
  params: unknown[] = [],
): { sql: string; params: unknown[] } {
  const { body } = stripReturning(sql.trim());
  const translated = translatePgSyntax(translateOnConflict(body));
  return convertPgParams(translated, params);
}

function stripReturning(sql: string): { body: string; returning: string | null } {
  const match = sql.match(/^([\s\S]*?)\s+RETURNING\s+(.+?)\s*$/i);
  if (!match) return { body: sql.trim(), returning: null };
  return { body: match[1].trim(), returning: match[2].trim() };
}

function shiftPlaceholders(sql: string, by: number): string {
  return sql.replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + by}`);
}

function injectInsertId(
  sql: string,
  params: unknown[],
): { sql: string; params: unknown[]; id?: string; cols: string[] } {
  const match = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(/i);
  if (!match) return { sql, params, cols: [] };
  const cols = match[2].split(',').map((c) => c.trim());
  if (cols.includes('id')) {
    const idx = cols.indexOf('id');
    const raw = params[idx];
    return { sql, params, id: raw == null ? undefined : String(raw), cols };
  }
  const id = randomUUID();
  const shifted = shiftPlaceholders(sql, 1);
  const withCol = shifted.replace(/INSERT\s+INTO\s+(\w+)\s*\(/i, 'INSERT INTO $1 (id, ');
  const withVal = withCol.replace(/VALUES\s*\(/i, 'VALUES ($1, ');
  return { sql: withVal, params: [id, ...params], id, cols: ['id', ...cols] };
}

async function rawQuery(
  conn: Pool | PoolConnection,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  const translated = translatePgSyntax(sql);
  const converted = convertPgParams(translated, params);
  const [result] =
    converted.params.length > 0
      ? await conn.query(converted.sql, converted.params)
      : await conn.query(converted.sql);
  if (Array.isArray(result)) {
    const rows = result as RowDataPacket[];
    return { rows: rows as unknown as Record<string, unknown>[], rowCount: rows.length };
  }
  const header = result as ResultSetHeader;
  return { rows: [], rowCount: header.affectedRows ?? 0 };
}

async function handleInsertReturning(
  conn: Pool | PoolConnection,
  body: string,
  returning: string,
  params: unknown[],
): Promise<QueryResult> {
  const originalColsMatch = body.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  const table = originalColsMatch?.[1];
  const originalCols = originalColsMatch?.[2].split(',').map((c) => c.trim()) ?? [];
  const injected = injectInsertId(body, params);
  const conflict = body.match(/ON CONFLICT\s*\(([^)]+)\)/i);
  const insertSql = translateOnConflict(injected.sql);
  await rawQuery(conn, insertSql, injected.params);

  if (!table) return { rows: [], rowCount: 0 };

  if (conflict) {
    const ccols = conflict[1].split(',').map((c) => c.trim());
    const whereParts: string[] = [];
    for (const col of ccols) {
      const idx = originalCols.indexOf(col);
      if (idx < 0) {
        throw new Error(`ON CONFLICT column ${col} is not in INSERT column list`);
      }
      whereParts.push(`${col} = $${idx + 1}`);
    }
    return rawQuery(conn, `SELECT ${returning} FROM ${table} WHERE ${whereParts.join(' AND ')}`, params);
  }

  if (injected.id) {
    return rawQuery(conn, `SELECT ${returning} FROM ${table} WHERE id = $1`, [injected.id]);
  }
  return { rows: [], rowCount: 0 };
}

async function handleUpdateReturning(
  conn: Pool | PoolConnection,
  body: string,
  returning: string,
  params: unknown[],
): Promise<QueryResult> {
  const table = body.match(/UPDATE\s+(\w+)/i)?.[1];
  const where = body.match(/\bWHERE\s+([\s\S]+)$/i)?.[1];
  if (!table) {
    await rawQuery(conn, body, params);
    return { rows: [], rowCount: 0 };
  }

  // Postgres RETURNING returns the NEW row. Re-running the original WHERE after
  // UPDATE fails when SET changes the same columns (deleted_at, used_at, status, …).
  let ids: string[] = [];
  if (where) {
    const matched = await rawQuery(conn, `SELECT id FROM ${table} WHERE ${where}`, params);
    ids = matched.rows.map((row) => String(row.id));
  }
  await rawQuery(conn, body, params);
  if (ids.length === 0) return { rows: [], rowCount: 0 };

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  return rawQuery(
    conn,
    `SELECT ${returning} FROM ${table} WHERE id IN (${placeholders})`,
    ids,
  );
}

async function handleDeleteReturning(
  conn: Pool | PoolConnection,
  body: string,
  returning: string,
  params: unknown[],
): Promise<QueryResult> {
  const table = body.match(/DELETE\s+FROM\s+(\w+)/i)?.[1];
  const where = body.match(/\bWHERE\s+([\s\S]+)$/i)?.[1];
  let selected: QueryResult = { rows: [], rowCount: 0 };
  if (table && where) {
    selected = await rawQuery(conn, `SELECT ${returning} FROM ${table} WHERE ${where}`, params);
  }
  await rawQuery(conn, body, params);
  return selected;
}

async function exec(
  conn: Pool | PoolConnection,
  text: string,
  params?: unknown[],
): Promise<QueryResult> {
  const { body, returning } = stripReturning(text.trim());
  if (!returning) {
    return rawQuery(conn, translateOnConflict(body), params);
  }
  if (/^INSERT\b/i.test(body)) {
    return handleInsertReturning(conn, body, returning, params ?? []);
  }
  if (/^UPDATE\b/i.test(body)) {
    return handleUpdateReturning(conn, body, returning, params ?? []);
  }
  if (/^DELETE\b/i.test(body)) {
    return handleDeleteReturning(conn, body, returning, params ?? []);
  }
  return rawQuery(conn, body, params);
}

export async function query<T extends DbRow = DbRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return exec(pool, text, params) as Promise<QueryResult<T>>;
}

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const client: DbClient = {
      query: ((text: string, params?: unknown[]) =>
        exec(connection, text, params)) as DbClient['query'],
    };
    const result = await fn(client);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function ensureDatabaseExists(): Promise<void> {
  const conn = await mysql.createConnection({
    ...baseConnConfig(),
    multipleStatements: true,
  });
  try {
    const db = env.DB_DATABASE.replace(/`/g, '');
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
