import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { useWorks } from '@/hooks/useBackend';
import { useI18n } from '@/i18n/useI18n';
import { SEO } from '@/components/SEO';
import { ArrowRight } from 'lucide-react';

export default function Works() {
  const { lang } = useI18n();
  const { data: worksList, isLoading } = useWorks();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current && worksList) {
      const items = listRef.current.querySelectorAll('.work-item');
      gsap.fromTo(
        items,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' }
      );
    }
  }, [worksList]);

  const title = lang === 'zh' ? '作品' : 'Works';
  const subtitle = lang === 'zh'
    ? '精选项目与设计实践'
    : 'Selected projects and design explorations';
  const sectionLabel = lang === 'zh' ? '全部作品' : 'All Projects';

  return (
    <>
      <SEO
        title={title}
        description={subtitle}
        keywords="projects, works, design, development, portfolio"
        url="/works"
      />
      <div className="min-h-screen pt-28 pb-24 md:pb-32">
        <div className="max-w-[800px] mx-auto px-6 md:px-10">
          {/* Page header */}
          <h1 className="font-display text-4xl md:text-6xl text-foreground mb-4 tracking-tight">
            {title}
          </h1>
          <p className="font-body text-sm text-muted-foreground mb-14">
            {subtitle}
          </p>

          {/* Section label */}
          <div className="mb-8">
            <span className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
              {sectionLabel}
            </span>
          </div>

          {/* Works list */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="py-8 animate-pulse">
                  <div className="h-3 bg-card rounded w-1/4 mb-3" />
                  <div className="h-8 bg-card rounded w-1/2 mb-2" />
                  <div className="h-4 bg-card rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <div ref={listRef} className="divide-y divide-border/30">
              {worksList?.map((work) => (
                <Link
                  key={work.id}
                  to={`/works/${work.slug}`}
                  className="work-item group flex items-start justify-between gap-6 py-8 md:py-10 hover:bg-card/30 -mx-4 px-4 rounded-sm transition-colors duration-300"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
                        {work.category}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {work.year}
                      </span>
                    </div>

                    <h2 className="font-display text-2xl md:text-3xl text-foreground leading-snug tracking-tight mb-2 group-hover:text-nocturne-gold transition-colors duration-300">
                      {work.title}
                    </h2>

                    <p className="font-body text-sm text-muted-foreground leading-relaxed mb-3 max-w-[520px]">
                      {work.subtitle}
                    </p>
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-nocturne-gold group-hover:translate-x-1 transition-all duration-300 mt-1 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
