/**
 * Sanitizes the `next` URL parameter to prevent open redirect attacks.
 * Only allows relative paths starting with a single `/`.
 */
export function sanitizeNextUrl(next: string | null): string {
  const DEFAULT = "/dashboard/quadro";
  if (!next) return DEFAULT;
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT;
  if (/^(https?:|javascript:|data:)/i.test(next)) return DEFAULT;
  return next;
}
