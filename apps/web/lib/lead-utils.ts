/**
 * Parses tags or adjectives from jsonb column.
 * Handles both string (JSON-encoded) and array formats.
 */
export function parseTags(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((t) => typeof t === 'string' && t.trim() !== '');
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '[]') return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((t: unknown) => typeof t === 'string' && (t as string).trim() !== '');
      return [trimmed];
    } catch {
      return [trimmed];
    }
  }
  return [];
}
