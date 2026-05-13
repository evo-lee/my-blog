import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/i18n/useI18n';
import { useSettings } from '@/hooks/useSettings';
import { Sun, Moon, Rss } from 'lucide-react';

export default function Header() {
  const { theme, toggle } = useTheme();
  const { lang, toggleLang, t } = useI18n();
  const { siteTitle } = useSettings();
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation();

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const onScroll = () => {
      if (window.scrollY > 60) {
        header.style.backdropFilter = 'blur(12px)';
        header.style.backgroundColor =
          theme === 'dark' ? 'rgba(33,41,54,0.75)' : 'rgba(248,249,250,0.75)';
      } else {
        header.style.backdropFilter = 'none';
        header.style.backgroundColor = 'transparent';
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [theme]);

  const navItems: Array<{ to: string; label: string; active: boolean }> = [
    { to: '/', label: t.nav.home, active: location.pathname === '/' },
    { to: '/articles', label: t.nav.articles, active: location.pathname === '/articles' },
    { to: '/works', label: t.nav.works, active: location.pathname.startsWith('/works') },
    { to: '/about', label: t.nav.about, active: location.pathname === '/about' },
  ];

  const navClass = (active: boolean) =>
    `font-body text-sm font-semibold uppercase tracking-wider transition-colors duration-300 ${
      active ? 'text-foreground' : 'text-foreground/60 hover:text-foreground'
    }`;

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 w-full z-50 transition-colors duration-300"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex items-center justify-between px-6 md:px-10 py-5 md:py-6">
        {/* Logo */}
        <Link
          to="/"
          className="font-display text-xl md:text-2xl text-foreground tracking-tight"
        >
          {siteTitle}
        </Link>

        {/* Nav + Language + Theme toggle */}
        <div className="flex items-center gap-4 md:gap-8">
          <nav className="hidden md:flex items-center gap-7">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} className={navClass(item.active)}>
                {item.label}
              </Link>
            ))}
            <a
              href="/feed.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-sm font-semibold uppercase tracking-wider text-foreground/60 hover:text-foreground transition-colors duration-300 flex items-center gap-1"
            >
              <Rss className="w-3 h-3" />
              RSS
            </a>
          </nav>

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="font-mono text-xs font-medium text-foreground/60 hover:text-foreground transition-colors duration-300 tracking-wide"
           
          >
            {lang === 'en' ? 'EN / 中' : '中 / EN'}
          </button>

          <button
            onClick={toggle}
            className="relative w-10 h-10 flex items-center justify-center rounded-full border border-border/50 text-foreground/70 hover:text-foreground hover:border-foreground/40 transition-all duration-300"
           
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
