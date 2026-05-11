// Resolve a possibly-relative URL against the current origin.
// Returns undefined for empty/nullish input so SEO components can fall back
// to their own defaults instead of emitting a broken absolute URL.
export function resolveImageUrl(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (typeof window === 'undefined') return trimmed;
  try {
    return new URL(trimmed, window.location.origin).toString();
  } catch {
    return undefined;
  }
}
