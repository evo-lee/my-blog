import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import gsap from 'gsap';
import { useWorkBySlug } from '@/hooks/useBackend';
import { useI18n } from '@/i18n/useI18n';
import { SEO, ArticleJSONLD } from '@/components/SEO';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export default function WorkDetail() {
  const { id } = useParams<{ id: string }>();
  const pageRef = useRef<HTMLDivElement>(null);
  const { lang } = useI18n();

  const { data: work, isLoading } = useWorkBySlug(id || '');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (pageRef.current && work) {
      gsap.fromTo(
        pageRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }
      );
    }
  }, [work]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-nocturne-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!work) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-4xl text-foreground mb-4">Project not found</h1>
          <Link
            to="/works"
            className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View all works
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={work.title}
        description={work.description || ''}
        keywords={`${work.category.toLowerCase()}, project, ${(work.tags || []).join(', ')}`}
        url={`/works/${work.slug}`}
      />
      <ArticleJSONLD
        title={work.title}
        description={work.description || ''}
        url={`/works/${work.slug}`}
        image="https://cnwr4i2bpug3w.ok.kimi.link/images/hero.jpg"
        datePublished={(work.year || '2024') + '-01-01'}
      />
      <div ref={pageRef} className="min-h-screen pt-28 pb-24 md:pb-32">
        <div className="max-w-[700px] mx-auto px-6 md:px-10">
          {/* Back button */}
          <Link
            to="/works"
            className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors duration-300 mb-12"
          >
            <ArrowLeft className="w-3 h-3" />
            {lang === 'zh' ? '全部作品' : 'All Works'}
          </Link>

          {/* Category + Year */}
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
              {work.category}
            </span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <span className="font-mono text-xs text-muted-foreground">
              {work.year}
            </span>
          </div>

          {/* Title */}
          <h1 className="font-display text-3xl md:text-5xl lg:text-[3.5rem] leading-tight text-foreground mb-3 tracking-tight">
            {work.title}
          </h1>

          {/* Subtitle */}
          <p className="font-body text-base md:text-lg text-muted-foreground mb-8 leading-relaxed">
            {work.subtitle}
          </p>

          {/* Tags */}
          {work.tags && work.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10">
              {work.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[10px] px-3 py-1.5 rounded-full border border-border/30 text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Large placeholder image area */}
          <div className="aspect-[16/9] bg-card rounded-sm border border-border/20 mb-12 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full border border-border/40 flex items-center justify-center mx-auto mb-4">
                <span className="font-display text-3xl text-muted-foreground/30">
                  01
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground/50">
                {lang === 'zh' ? '项目预览图占位' : 'Project preview placeholder'}
              </span>
            </div>
          </div>

          {/* Description */}
          {work.description && (
            <p className="font-body text-lg md:text-xl leading-relaxed text-muted-foreground mb-10 italic font-display">
              {work.description}
            </p>
          )}

          <div className="w-16 h-px bg-border mb-10" />

          {/* Details */}
          <div className="space-y-8">
            {(work.details || []).map((paragraph, i) => {
              if (i === 0) {
                return (
                  <p
                    key={i}
                    className="font-body text-base md:text-lg leading-[1.8] text-foreground"
                  >
                    <span className="float-left font-display text-5xl md:text-6xl leading-[0.8] mr-3 mt-1 text-nocturne-gold">
                      {paragraph.charAt(0)}
                    </span>
                    {paragraph.slice(1)}
                  </p>
                );
              }
              return (
                <p
                  key={i}
                  className="font-body text-base md:text-lg leading-[1.8] text-foreground"
                >
                  {paragraph}
                </p>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border/30 mt-16 pt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <Link
              to="/works"
              className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              <ArrowLeft className="w-3 h-3" />
              {lang === 'zh' ? '全部作品' : 'All Works'}
            </Link>

            {work.link && (
              <a
                href={work.link}
                className="inline-flex items-center gap-2 font-mono text-xs text-nocturne-gold hover:text-foreground transition-colors duration-300"
              >
                <ExternalLink className="w-3 h-3" />
                {lang === 'zh' ? '访问项目' : 'Visit Project'}
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
