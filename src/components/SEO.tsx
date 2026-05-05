import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  lang?: string;
}

const SITE_URL = 'https://cnwr4i2bpug3w.ok.kimi.link';
const DEFAULT_IMAGE = `${SITE_URL}/images/hero.jpg`;
const DEFAULT_DESCRIPTION = "Thoughts on literature, design, and the quiet spaces in between. A personal blog by Evo Lee.";

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  author = 'Evo Lee',
  publishedTime,
  modifiedTime,
  tags,
  lang = 'en',
}: SEOProps) {
  const fullTitle = title ? `${title} — Lee's Blog` : "Lee's Blog";
  const fullUrl = url ? `${SITE_URL}${url}` : SITE_URL;

  return (
    <Helmet>
      {/* Basic */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <html lang={lang} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="author" content={author} />

      {/* Canonical */}
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="Lee's Blog" />
      <meta property="og:locale" content={lang === 'zh' ? 'zh_CN' : 'en_US'} />

      {/* Article specific OG */}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}
      {type === 'article' && tags?.map((tag) => (
        <meta property="article:tag" content={tag} key={tag} />
      ))}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:creator" content="@evolee" />
    </Helmet>
  );
}

export function ArticleJSONLD({
  title,
  description,
  url,
  image,
  datePublished,
  dateModified,
  author = 'Evo Lee',
  wordCount,
}: {
  title: string;
  description: string;
  url: string;
  image: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
  wordCount?: number;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    image,
    url: `${SITE_URL}${url}`,
    datePublished: formatISODate(datePublished),
    dateModified: dateModified ? formatISODate(dateModified) : formatISODate(datePublished),
    author: {
      '@type': 'Person',
      name: author,
      url: `${SITE_URL}/about`,
    },
    publisher: {
      '@type': 'Organization',
      name: "Lee's Blog",
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/images/hero.jpg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}${url}`,
    },
    ...(wordCount ? { wordCount } : {}),
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
}

export function PersonJSONLD() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Evo Lee',
    url: SITE_URL,
    jobTitle: 'Writer & Designer',
    sameAs: [
      // Add your social profiles here
      // 'https://twitter.com/evolee',
      // 'https://github.com/evolee',
    ],
    worksFor: {
      '@type': 'Organization',
      name: "Lee's Blog",
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
}

function formatISODate(dateStr: string): string {
  // Convert "2026.04.12" to "2026-04-12T00:00:00+08:00"
  const cleaned = dateStr.replace(/\./g, '-');
  return `${cleaned}T00:00:00+08:00`;
}
