import type { Lang } from '@/i18n/translations';

export function formatCommentDate(
  d: Date | string | null | undefined,
  lang: Lang
): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCommentDateTime(
  d: Date | string | null | undefined,
  lang: Lang
): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}
