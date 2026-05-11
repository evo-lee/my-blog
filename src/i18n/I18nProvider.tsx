import { useState, type ReactNode } from 'react';
import { translations, type Lang } from './translations';
import { I18nContext } from '@/i18n/i18n-context';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  const toggleLang = () => setLang((prev) => (prev === 'en' ? 'zh' : 'en'));

  const t = translations[lang];

  return (
    <I18nContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
}
