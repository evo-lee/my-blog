import type { Lang } from './translations';

export const STORAGE_KEY = 'lang';

// Pure resolver. Saved value wins (if valid); else navigator.language picks
// 'zh' for any zh-* tag and 'en' otherwise. Extracted so it can be tested
// without a DOM.
export function resolveInitialLang(
  saved: string | null | undefined,
  navigatorLang: string | undefined,
): Lang {
  if (saved === 'en' || saved === 'zh') return saved;
  return /^zh/i.test(navigatorLang ?? '') ? 'zh' : 'en';
}
