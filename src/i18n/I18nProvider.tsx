import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { translations, type Lang } from './translations';
import { I18nContext } from '@/i18n/i18n-context';

import { STORAGE_KEY, resolveInitialLang } from './lang-init';

function readInitialLang(): Lang {
  if (typeof window === 'undefined') return 'en';

  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage can throw in private mode; fall through to navigator.
  }

  const navLang =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : '';
  return resolveInitialLang(saved, navLang);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Lazy initializer — runs once synchronously, so the first paint already
  // has the right language. A useEffect-based init would flash English first.
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  const setLang = useCallback((next: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persisting is best-effort; the in-memory state still updates.
    }
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'en' ? 'zh' : 'en');
  }, [lang, setLang]);

  // Keep <html lang> in sync so screen readers / search engines see the
  // active language. The hardcoded `lang="en"` in index.html is just the
  // bootstrap value before React mounts.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    }
  }, [lang]);

  const t = translations[lang];

  return (
    <I18nContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
}
