/** MariaDB often returns JSON columns as strings (sometimes double-encoded). */
export function parseJsonField(value: unknown): unknown {
  let current: unknown = value;
  if (Buffer.isBuffer(current)) {
    current = current.toString('utf8');
  }
  for (let i = 0; i < 2; i += 1) {
    if (typeof current !== 'string') break;
    const trimmed = current.trim();
    if (!trimmed) return null;
    if (trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed[0] !== '"') {
      return current;
    }
    try {
      current = JSON.parse(trimmed);
    } catch {
      return i === 0 ? value : current;
    }
  }
  return current;
}

export function asJsonObject(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonField(value);
  if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}
