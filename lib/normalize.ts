/**
 * Normalize a food name into a stable cache key.
 *
 * - lowercases
 * - strips diacritics
 * - removes punctuation
 * - collapses whitespace
 * - deduplicates and sorts tokens
 *
 * Stable across input variations like "Cooked Spaghetti" and "spaghetti, cooked!!".
 */
export function normalize(input: string): string {
  const ascii = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const tokens = ascii
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return Array.from(new Set(tokens)).sort().join(" ");
}
