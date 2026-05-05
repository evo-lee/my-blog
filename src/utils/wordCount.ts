export function countWords(text: string): number {
  // Count English words and approximate Chinese characters
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherWords = (text.match(/[\u0400-\u04ff\u00c0-\u017f]+/g) || []).length;
  return englishWords + chineseChars + otherWords;
}

export function getArticleWordCount(content: string[]): number {
  const fullText = content.join(' ');
  return countWords(fullText);
}

export function formatWordCount(count: number, lang: 'en' | 'zh' = 'en'): string {
  if (lang === 'zh') {
    return `${count.toLocaleString()} 字`;
  }
  return `${count.toLocaleString()} words`;
}
