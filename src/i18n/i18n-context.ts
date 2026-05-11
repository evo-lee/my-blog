import { createContext, useContext } from 'react';
import { translations, type Lang, type Translations } from './translations';

export interface I18nContextType {
  lang: Lang;
  t: Translations;
  toggleLang: () => void;
}

export const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  t: translations.en,
  toggleLang: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}
