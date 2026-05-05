import WorkCard from '@/components/WorkCard';
import { useWorks } from '@/hooks/useBackend';
import { Link } from 'react-router';
import { useI18n } from '@/i18n/useI18n';
import { ArrowRight } from 'lucide-react';

export default function WorkList() {
  const { lang } = useI18n();
  const { data: worksList } = useWorks();
  const displayedWorks = (worksList || []).slice(0, 3);

  const sectionLabel = lang === 'zh' ? '作品' : 'Works';
  const viewAllLabel = lang === 'zh' ? '查看全部' : 'View All';

  return (
    <section className="pb-16 md:pb-20">
      <div className="max-w-[1200px] mx-auto px-6 md:px-10">
        {/* Section header */}
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
            {sectionLabel}
          </h2>
          <Link
            to="/works"
            className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors duration-300 flex items-center gap-1.5 group"
          >
            {viewAllLabel}
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform duration-300" />
          </Link>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {displayedWorks.map((work, i) => (
            <WorkCard
              key={work.id}
              id={work.slug}
              title={work.title}
              subtitle={work.subtitle || ''}
              category={work.category}
              year={work.year || ''}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
