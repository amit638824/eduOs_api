/** Read string env with fallback — app won't crash if missing */
export function str(key: string | readonly string[], fallback = ''): string {
  if (Array.isArray(key)) {
    for (const k of key) {
      const val = process.env[k]?.trim();
      if (val) return val;
    }
    return fallback;
  }
  const v = process.env[key as string];
  return v !== undefined ? v.trim() : fallback;
}

/** Read number env with fallback */
export function num(key: string | readonly string[], fallback: number): number {
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

/** Read boolean env (`true` / `1` / `live` / `prod`) with fallback */
export function bool(key: string | readonly string[], fallback: boolean): boolean {
  const keys = Array.isArray(key) ? key : [key];
  for (const k of keys) {
    const raw = process.env[k]?.trim().toLowerCase();
    if (raw !== undefined && raw !== '') {
      if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'live' || raw === 'prod') {
        return true;
      }
      if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'local' || raw === 'test') {
        return false;
      }
    }
  }
  return fallback;
}

/** Warn when recommended or required variables are missing */
export function warnMissing(keys: (string | readonly string[])[], level: 'warn' | 'error' = 'warn'): void {
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

/** Normalize URL origin for CORS */
export function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

/** Build an absolute frontend URL (strips duplicate slashes). */
export function buildFrontendUrl(baseFrontendUrl: string, path = ''): string {
  const base = baseFrontendUrl.replace(/\/$/, '');
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

