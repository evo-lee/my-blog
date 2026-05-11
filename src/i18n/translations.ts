export type Lang = 'zh' | 'en';

export const translations = {
  en: {
    nav: {
      works: 'Works',
      articles: 'Articles',
      about: 'About',
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
    comments: {
      title: 'Comments',
      empty: 'No comments yet. Be the first to say something.',
      name: 'Name',
      email: 'Email (optional, never shown)',
      content: 'Your comment',
      submit: 'Post comment',
      submitting: 'Posting…',
      pending: 'Thanks — your comment is awaiting moderation.',
      moderationNote: 'Comments are reviewed before they appear.',
    },
  },
  zh: {
    nav: {
      works: '作品',
      articles: '文章',
      about: '关于',
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
    comments: {
      title: '评论',
      empty: '暂无评论，来说点什么吧。',
      name: '昵称',
      email: '邮箱（可选，不会公开）',
      content: '你的评论',
      submit: '发表评论',
      submitting: '提交中…',
      pending: '感谢留言，评论正在审核中。',
      moderationNote: '评论需审核通过后显示。',
    },
  },
} as const;

export type Translations = typeof translations[Lang];
