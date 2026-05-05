import ThumbnailCard from '@/components/ThumbnailCard';
import { usePosts } from '@/hooks/useBackend';
import { useI18n } from '@/i18n/useI18n';

export default function PostList() {
  const { t } = useI18n();
  const { data, isLoading } = usePosts(1, 6);

  if (isLoading) {
    return (
      <section className="pb-16 md:pb-20">
        <div className="max-w-[1200px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[16/10] bg-card rounded-sm mb-5" />
                <div className="h-4 bg-card rounded w-1/3 mb-2" />
                <div className="h-6 bg-card rounded w-3/4 mb-2" />
                <div className="h-4 bg-card rounded w-1/4" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const allPosts = data?.items || [];
  const firstRow = allPosts.slice(0, 3);
  const secondRow = allPosts.slice(3, 6);

  return (
    <section className="pb-16 md:pb-20">
      <div className="max-w-[1200px] mx-auto px-6 md:px-10">
        {/* Section title */}
        <div className="mb-8 md:mb-10">
          <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
            {t.articles.sectionTitle}
          </h2>
        </div>

        {/* First row: 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 mb-8 md:mb-10">
          {firstRow.map((post, i) => (
            <ThumbnailCard
              key={post.id}
              id={post.slug}
              category={post.category}
              title={post.title}
              date={post.publishedDate || ''}
              image={post.coverImage || ''}
              index={i}
            />
          ))}
        </div>

        {/* Second row: 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {secondRow.map((post, i) => (
            <ThumbnailCard
              key={post.id}
              id={post.slug}
              category={post.category}
              title={post.title}
              date={post.publishedDate || ''}
              image={post.coverImage || ''}
              index={i + 3}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
