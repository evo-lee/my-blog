import { trpc } from '@/providers/trpc-client';
import { useI18n } from '@/i18n/useI18n';
import { SITE_DEFAULTS } from '@db/site-defaults';

export function useSettings() {
  const { lang } = useI18n();
  const { data } = trpc.settings.get.useQuery(undefined, {
    staleTime: 60_000,
  });
  const s = data ?? SITE_DEFAULTS;
  return {
    siteTitle: s.siteTitle,
    heroTitle: lang === 'zh' ? s.heroTitleZh : s.heroTitleEn,
    heroSubtitle: lang === 'zh' ? s.heroSubtitleZh : s.heroSubtitleEn,
    icpNumber: s.icpNumber,
    publicSecurityNumber: s.publicSecurityNumber,
    copyright: lang === 'zh' ? s.copyrightZh : s.copyrightEn,
    raw: s,
  };
}
