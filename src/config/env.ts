import 'dotenv/config';

/** Read string env with fallback — app won't crash if missing */
function str(key: string | readonly string[], fallback = ''): string {
  if (Array.isArray(key)) {
    for (const k of key) {
      const val = process.env[k]?.trim();
      if (val) return val;
    }
    return fallback;
  }
  return process.env[key as string]?.trim() || fallback;
}

/** Read number env with fallback */
function num(key: string | readonly string[], fallback: number): number {
  const keys = Array.isArray(key) ? key : [key];
  for (const k of keys) {
    const raw = process.env[k];
    if (raw?.trim()) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
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
 * Browser CORS for mindsprint.techwagger.com, apimindsprint.techwagger.com, and onlineexam.techwagger.com
 */
const PRODUCTION_FRONTEND_URL = 'https://mindsprint.techwagger.com';
const PRODUCTION_CORS_ORIGINS = [
  'https://mindsprint.techwagger.com',
  'https://www.mindsprint.techwagger.com',
  'https://apimindsprint.techwagger.com',
  'https://onlineexam.techwagger.com',
  'https://www.onlineexam.techwagger.com',
] as const;
const LOCAL_CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173';
const DEFAULT_CORS_ORIGINS = [...PRODUCTION_CORS_ORIGINS, LOCAL_CORS_ORIGINS].join(',');

const FRONTEND_URL_LOCAL = str('FRONTEND_URL_LOCAL', 'http://localhost:5173').replace(/\/$/, '');
const FRONTEND_URL_PROD = str('FRONTEND_URL_PROD', PRODUCTION_FRONTEND_URL).replace(/\/$/, '');
const FRONTEND_URL = str(
  'FRONTEND_URL',
  NODE_ENV === 'production' ? FRONTEND_URL_PROD : FRONTEND_URL_LOCAL,
).replace(/\/$/, '');

/** Absolute asset URLs for email clients (cannot load localhost images) */
const EMAIL_ASSET_BASE = str('EMAIL_ASSET_BASE', FRONTEND_URL_PROD).replace(/\/$/, '');

/** Dev-only JWT fallbacks — never use in production without real secrets */
const DEV_JWT_ACCESS =
  'dev_only_access_secret_minimum_sixty_four_characters_for_local_development_use';
const DEV_JWT_REFRESH =
  'dev_only_refresh_secret_minimum_sixty_four_characters_for_local_development_use';

export const env = {
  NODE_ENV,
  PORT: num('PORT', 3000),

  DB_TYPE: 'mysql' as const,
  DB_HOST: str('DB_HOST', 's12078.use1.stableserver.net'),
  DB_PORT: num('DB_PORT', 3306),
  DB_USERNAME: str(['DB_USERNAME', 'DB_USER'], 'techwagger_mindsprint_user'),
  DB_USER: str(['DB_USER', 'DB_USERNAME'], 'techwagger_mindsprint_user'),
  DB_PASSWORD: str('DB_PASSWORD', 'xFf}8=ltevWS9HPj'),
  DB_DATABASE: str(['DB_DATABASE', 'DB_NAME'], 'techwagger_mindsprint_db'),
  DB_NAME: str(['DB_NAME', 'DB_DATABASE'], 'techwagger_mindsprint_db'),
  DB_SSL: bool('DB_SSL', false),
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
  APP_NAME: str('APP_NAME', 'Mindsprint'),
  TRUST_PROXY: num('TRUST_PROXY', 1),

  /** Used in email links (login, reset password, dashboard) */
  FRONTEND_URL,
  FRONTEND_URL_LOCAL,
  FRONTEND_URL_PROD,
  EMAIL_ASSET_BASE,
  LOGO_URL: str('LOGO_URL', `${EMAIL_ASSET_BASE}/img/logo/techwagger-logo.png`),
  EMAIL_CTA_DASHBOARD_PNG: str(
    'EMAIL_CTA_DASHBOARD_PNG',
    `${EMAIL_ASSET_BASE}/img/email/go-to-dashboard.png`,
  ),
  EMAIL_CTA_RESET_PNG: str(
    'EMAIL_CTA_RESET_PNG',
    `${EMAIL_ASSET_BASE}/img/email/reset-password.png`,
  ),
  /** @deprecated use EMAIL_CTA_RESET_PNG — kept for older .env files */
  RESET_PASSWORD_PNG: str(
    'RESET_PASSWORD_PNG',
    `${EMAIL_ASSET_BASE}/img/email/reset-password.png`,
  ),

  SMTP_HOST: str('SMTP_HOST'),
  SMTP_PORT: num('SMTP_PORT', 587),
  SMTP_USER: str('SMTP_USER'),
  SMTP_PASS: str('SMTP_PASS'),
  SMTP_FROM: str('SMTP_FROM'),
  BCC_EMAILS: str('BCC_EMAILS'),

  RAZORPAY_KEY_ID: str('RAZORPAY_KEY_ID'),
  RAZORPAY_KEY_SECRET: str('RAZORPAY_KEY_SECRET'),
} as const;

/** Build an absolute frontend URL (strips duplicate slashes). */
export function frontendUrl(path = ''): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function warnMissing(keys: (string | readonly string[])[], level: 'warn' | 'error' = 'warn') {
  const missing = keys.filter((k) => {
    if (Array.isArray(k)) {
      return !k.some((subKey) => process.env[subKey]?.trim());
    }
    return !process.env[k as string]?.trim();
  });
  if (missing.length === 0) return;
  const missingLabels = missing.map((k) => (Array.isArray(k) ? k.join('/') : k));
  const msg = `[env] Missing ${level === 'error' ? 'required' : 'recommended'} variables: ${missingLabels.join(', ')}`;
  if (level === 'error') console.error(msg);
  else console.warn(msg);
}

if (NODE_ENV === 'production') {
  warnMissing(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'], 'warn');
  if (/localhost|127\.0\.0\.1/i.test(env.FRONTEND_URL)) {
    console.error(
      `[env] FRONTEND_URL is "${env.FRONTEND_URL}" in production — set FRONTEND_URL or FRONTEND_URL_PROD to ${FRONTEND_URL_PROD}`,
    );
  }
} else {
  warnMissing(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']);
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
