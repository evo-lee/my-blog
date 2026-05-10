import { useState } from 'react';
import { Link } from 'react-router';
import { usePosts, useSearchPosts } from '@/hooks/useBackend';
import { useI18n } from '@/i18n/useI18n';
import { SEO } from '@/components/SEO';
import { Search, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Articles() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 6;

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const listQuery = usePosts(page, perPage);
  const searchQuery = useSearchPosts(trimmedQuery);

  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;
  // Search returns the full result set; paginate client-side for parity with list view.
  const allHits = isSearching ? searchQuery.data ?? [] : [];
  const total = isSearching ? allHits.length : listQuery.data?.total ?? 0;
  const totalPages = isSearching
    ? Math.max(1, Math.ceil(allHits.length / perPage))
    : listQuery.data?.totalPages ?? 1;
  const posts = isSearching
    ? allHits.slice((page - 1) * perPage, page * perPage)
    : listQuery.data?.items ?? [];

  const hasData = isSearching ? !searchQuery.isLoading : !!listQuery.data;

  const articleT = t.articles;

  return (
    <>
      <SEO
        title={articleT.allArticles}
        description={lang === 'zh' ? '浏览全部文章，或搜索关键词' : 'Browse all articles or search by keyword'}
        keywords="articles, blog, writing, search"
        url="/articles"
      />
      <div className="min-h-screen pt-28 pb-24 md:pb-32">
        <div className="max-w-[800px] mx-auto px-6 md:px-10">
          {/* Page title */}
          <h1 className="font-display text-4xl md:text-6xl text-foreground mb-4 tracking-tight">
            {articleT.allArticles}
          </h1>
          <p className="font-body text-sm text-muted-foreground mb-12">
            {lang === 'zh' ? '浏览全部文章，或搜索关键词' : 'Browse all articles or search by keyword'}
          </p>

          {/* Search bar */}
          <div className="relative mb-10">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder={articleT.search}
              className="w-full pl-11 pr-4 py-3.5 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50 transition-all"
            />
          </div>

          {/* Result count */}
          {!isLoading && hasData && (
            <p className="font-mono text-xs text-muted-foreground mb-6">
              {articleT.searchResult.replace('{{count}}', String(total))} — {lang === 'zh' ? '第' : 'Page'} {page} / {totalPages}
            </p>
          )}

          {/* Article list */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="py-6 animate-pulse">
                  <div className="h-4 bg-card rounded w-1/4 mb-3" />
                  <div className="h-6 bg-card rounded w-3/4 mb-2" />
                  <div className="h-4 bg-card rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : posts.length > 0 ? (
            <div className="divide-y divide-border/30">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/article/${post.slug}`}
                  className="group flex items-start justify-between gap-6 py-6 md:py-8 hover:bg-card/30 -mx-4 px-4 rounded-sm transition-colors duration-300"
                >
                  <div className="flex-1 min-w-0">
                    <span className="block font-mono text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                      {post.category}
                    </span>
                    <h2 className="font-display text-xl md:text-2xl text-foreground leading-snug tracking-tight mb-2 group-hover:text-nocturne-gold transition-colors duration-300">
                      {post.title}
                    </h2>
                    <p className="font-body text-sm text-muted-foreground leading-relaxed line-clamp-2 max-w-[540px]">
                      {post.excerpt}
                    </p>
                    <time className="block font-mono text-xs text-muted-foreground mt-3">
                      {post.publishedDate}
                    </time>
                  </div>

                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-nocturne-gold group-hover:translate-x-1 transition-all duration-300 mt-1 flex-shrink-0" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="font-body text-muted-foreground">{articleT.noResult}</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-12">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 flex items-center justify-center rounded-sm font-mono text-xs transition-colors ${
                    p === page
                      ? 'bg-foreground text-background'
                      : 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                  }`}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-10 h-10 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
