export type Lang = 'zh' | 'en';

export const translations = {
  en: {
    nav: {
      works: 'Works',
      articles: 'Articles',
      about: 'About',
    },
    hero: {
      title: 'Evo Lee',
      subtitle: 'Thoughts on literature, design, and the quiet spaces in between.',
    },
    articles: {
      sectionTitle: 'Articles',
      readMore: 'Read more',
      search: 'Search articles...',
      searchResult: '{{count}} articles found',
      noResult: 'No articles match your search.',
      allArticles: 'All Articles',
    },
    post: {
      back: 'Back',
      allWritings: 'All writings',
    },
    footer: {
      copyright: '\u00a9 2026 \u2014 All rights reserved',
    },
  },
  zh: {
    nav: {
      works: '作品',
      articles: '文章',
      about: '关于',
    },
    hero: {
      title: 'Evo Lee',
      subtitle: '关于文学、设计，以及其间安静角落的思考。',
    },
    articles: {
      sectionTitle: '文章',
      readMore: '阅读全文',
      search: '搜索文章...',
      searchResult: '找到 {{count}} 篇文章',
      noResult: '没有匹配的文章。',
      allArticles: '全部文章',
    },
    post: {
      back: '返回',
      allWritings: '全部文章',
    },
    footer: {
      copyright: '\u00a9 2026 \u2014 保留所有权利',
    },
  },
} as const;

export type Translations = typeof translations[Lang];
