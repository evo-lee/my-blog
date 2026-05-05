import { createContext, useContext, useState, type ReactNode } from 'react';
import { translations, type Lang, type Translations } from './translations';

interface I18nContextType {
  lang: Lang;
  t: Translations;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  t: translations.en,
  toggleLang: () => {},
});

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

export function useI18n() {
  return useContext(I18nContext);
}
