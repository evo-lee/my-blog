import { useSettings } from '@/hooks/useSettings';

export default function Footer() {
  const { siteTitle, icpNumber, publicSecurityNumber, copyright } = useSettings();

  const hasIcp = icpNumber.trim().length > 0;
  const hasPsb = publicSecurityNumber.trim().length > 0;

  return (
    <footer className="pt-8 pb-8 px-6 md:px-10 border-t border-border/30">
      <div className="max-w-[1200px] mx-auto">
        {/* Single row: Logo | ICP | Copyright */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
          <span className="font-display text-lg text-foreground tracking-tight">
            {siteTitle}
          </span>

          {/* 备案号 (hidden if both empty) */}
          {(hasIcp || hasPsb) && (
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              {hasIcp && (
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-muted-foreground/60 hover:text-foreground tracking-wide transition-colors"
                >
                  {icpNumber}
                </a>
              )}
              {hasIcp && hasPsb && <span className="hidden sm:block w-px h-3 bg-border/30" />}
              {hasPsb && (
                <span className="font-mono text-[10px] text-muted-foreground/60 tracking-wide flex items-center gap-1.5">
                  <svg className="w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                  </svg>
                  {publicSecurityNumber}
                </span>
              )}
            </div>
          )}

          <span className="font-mono text-xs text-muted-foreground">
            {copyright}
          </span>
        </div>
      </div>
    </footer>
  );
}
