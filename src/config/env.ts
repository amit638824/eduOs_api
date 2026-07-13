import 'dotenv/config';

/** Read string env with fallback — app won't crash if missing */
function str(key: string, fallback = ''): string {
  return process.env[key]?.trim() || fallback;
}

/** Read number env with fallback */
function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Read boolean env (`true` / `1`) with fallback */
function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw?.trim()) return fallback;
  return raw === 'true' || raw === '1';
}

const nodeEnvRaw = process.env.NODE_ENV?.trim();
const NODE_ENV =
  nodeEnvRaw === 'production' || nodeEnvRaw === 'test' || nodeEnvRaw === 'development'
    ? nodeEnvRaw
    : 'development';

/**
 * Production URLs — hardcoded for server deploy when .env is not uploaded.
 * Browser CORS for https://onlineexam.techwagger.com
 */
const PRODUCTION_FRONTEND_URL = 'https://onlineexam.techwagger.com';
const PRODUCTION_CORS_ORIGINS = [
  PRODUCTION_FRONTEND_URL,
  'https://www.onlineexam.techwagger.com',
] as const;
const LOCAL_CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173';
const DEFAULT_CORS_ORIGINS = [...PRODUCTION_CORS_ORIGINS, LOCAL_CORS_ORIGINS].join(',');
const DEFAULT_FRONTEND_URL =
  NODE_ENV === 'production' ? PRODUCTION_FRONTEND_URL : 'http://localhost:5173';

/** Dev-only JWT fallbacks — never use in production without real secrets */
const DEV_JWT_ACCESS =
  'dev_only_access_secret_minimum_sixty_four_characters_for_local_development_use';
const DEV_JWT_REFRESH =
  'dev_only_refresh_secret_minimum_sixty_four_characters_for_local_development_use';

export const env = {
  NODE_ENV,
  PORT: num('PORT', 3000),

  DB_TYPE: 'postgres' as const,
  DB_HOST: str('DB_HOST', 'localhost'),
  DB_PORT: num('DB_PORT', 5432),
  DB_USERNAME: str('DB_USERNAME', 'postgres'),
  DB_PASSWORD: str('DB_PASSWORD', ''),
  DB_DATABASE: str('DB_DATABASE', 'edutech'),
  DB_SSL: bool('DB_SSL', true),
  DB_SSL_REJECT_UNAUTHORIZED: bool('DB_SSL_REJECT_UNAUTHORIZED', false),
  DB_POOL_MAX: num('DB_POOL_MAX', 20),
  DB_IDLE_TIMEOUT_MS: num('DB_IDLE_TIMEOUT_MS', 30_000),
  DB_CONNECTION_TIMEOUT_MS: num('DB_CONNECTION_TIMEOUT_MS', 5_000),

  JWT_ACCESS_SECRET: str('JWT_ACCESS_SECRET', DEV_JWT_ACCESS),
  JWT_REFRESH_SECRET: str('JWT_REFRESH_SECRET', DEV_JWT_REFRESH),
  JWT_ACCESS_EXPIRES_IN: str('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: str('JWT_REFRESH_EXPIRES_IN', '7d'),

  CORS_ORIGINS: str('CORS_ORIGINS', DEFAULT_CORS_ORIGINS),
  RATE_LIMIT_WINDOW_MS: num('RATE_LIMIT_WINDOW_MS', 900_000),
  RATE_LIMIT_MAX: num('RATE_LIMIT_MAX', 100),
  AUTH_RATE_LIMIT_MAX: num('AUTH_RATE_LIMIT_MAX', 10),

  BCRYPT_ROUNDS: num('BCRYPT_ROUNDS', 12),
  APP_NAME: str('APP_NAME', 'Super Computer Academy'),
  TRUST_PROXY: num('TRUST_PROXY', 1),

  FRONTEND_URL: str('FRONTEND_URL', DEFAULT_FRONTEND_URL),

  SMTP_HOST: str('SMTP_HOST'),
  SMTP_PORT: num('SMTP_PORT', 587),
  SMTP_USER: str('SMTP_USER'),
  SMTP_PASS: str('SMTP_PASS'),
  SMTP_FROM: str('SMTP_FROM'),
  BCC_EMAILS: str('BCC_EMAILS'),

  RAZORPAY_KEY_ID: str('RAZORPAY_KEY_ID'),
  RAZORPAY_KEY_SECRET: str('RAZORPAY_KEY_SECRET'),
} as const;

function warnMissing(keys: string[], level: 'warn' | 'error' = 'warn') {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length === 0) return;
  const msg = `[env] Missing ${level === 'error' ? 'required' : 'recommended'} variables: ${missing.join(', ')}`;
  if (level === 'error') console.error(msg);
  else console.warn(msg);
}

if (NODE_ENV === 'production') {
  warnMissing(['DB_HOST', 'DB_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'], 'error');
} else {
  warnMissing(['DB_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']);
}

export const isProduction = env.NODE_ENV === 'production';

export function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

/** Allowed browser origins — production URLs always included (even without .env on server). */
export const corsOrigins = Array.from(
  new Set(
    [...PRODUCTION_CORS_ORIGINS, env.CORS_ORIGINS, env.FRONTEND_URL]
      .flatMap((value) => String(value).split(','))
      .map(normalizeOrigin)
      .filter(Boolean),
  ),
);

export const isSmtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

export const isRazorpayConfigured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export const bccEmails = (env.BCC_EMAILS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);
