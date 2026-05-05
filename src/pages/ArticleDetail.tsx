import { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router';
import gsap from 'gsap';
import { usePostBySlug } from '@/hooks/useBackend';
import { useI18n } from '@/i18n/useI18n';
import { getArticleWordCount, formatWordCount } from '@/utils/wordCount';
import { SEO, ArticleJSONLD } from '@/components/SEO';
import { ArrowLeft, Clock } from 'lucide-react';

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const articleRef = useRef<HTMLDivElement>(null);
  const { t, lang } = useI18n();

  const { data: post, isLoading } = usePostBySlug(id || '');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (articleRef.current && post) {
      gsap.fromTo(
        articleRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }
      );
    }
  }, [post]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-nocturne-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-4xl text-foreground mb-4">Article not found</h1>
          <Link
            to="/"
            className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Return home
          </Link>
        </div>
      </div>
    );
  }

  const wordCount = getArticleWordCount(post.content);

  return (
    <>
      <SEO
        title={post.title}
        description={post.excerpt || ''}
        keywords={`${post.category.toLowerCase()}, blog, Evo Lee`}
        image={`https://cnwr4i2bpug3w.ok.kimi.link${post.coverImage}`}
        url={`/article/${post.slug}`}
        type="article"
        author="Evo Lee"
        publishedTime={post.publishedDate || ''}
        tags={[post.category]}
      />
      <ArticleJSONLD
        title={post.title}
        description={post.excerpt || ''}
        url={`/article/${post.slug}`}
        image={`https://cnwr4i2bpug3w.ok.kimi.link${post.coverImage}`}
        datePublished={post.publishedDate || ''}
        wordCount={wordCount}
      />
      <article ref={articleRef} className="min-h-screen pt-24 pb-24 md:pb-32">
        <div className="max-w-[700px] mx-auto px-6 md:px-10">
          {/* Back button */}
          <Link
            to="/articles"
            className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors duration-300 mb-12"
          >
            <ArrowLeft className="w-3 h-3" />
            {t.post.back}
          </Link>

          {/* Category */}
          <span className="block font-mono text-xs tracking-widest uppercase text-muted-foreground mb-4">
            {post.category}
          </span>

          {/* Title */}
          <h1 className="font-display text-3xl md:text-5xl lg:text-[3.5rem] leading-tight text-foreground mb-4 tracking-tight">
            {post.title}
          </h1>

          {/* Date + Word count */}
          <div className="flex items-center gap-4 mb-10">
            <time className="font-mono text-xs text-muted-foreground">
              {post.publishedDate}
            </time>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <span className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {formatWordCount(wordCount, lang)}
            </span>
          </div>

          {/* Hero image */}
          {post.coverImage && (
            <div className="relative overflow-hidden rounded-sm mb-12">
              <div className="aspect-[16/10] overflow-hidden">
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Excerpt */}
          {post.excerpt && (
            <p className="font-body text-lg md:text-xl leading-relaxed text-muted-foreground mb-12 italic font-display">
              {post.excerpt}
            </p>
          )}

          {/* Divider */}
          <div className="w-16 h-px bg-border mb-12" />

          {/* Article body */}
          <div className="space-y-8">
            {post.content.map((paragraph, i) => {
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

          {/* Footer divider */}
          <div className="border-t border-border/30 mt-16 pt-12">
            <Link
              to="/articles"
              className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              <ArrowLeft className="w-3 h-3" />
              {t.post.allWritings}
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
