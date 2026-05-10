// Estimate word count from a paragraph array. Empty input returns 0
// (the naive `"".split(/\s+/).length` returns 1, which is wrong).
export function countWords(paragraphs: string[]): number {
  const text = paragraphs.join(" ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}
