export type Lang = 'zh' | 'en';

export const translations = {
  en: {
    nav: {
      home: 'Home',
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
    notFound: {
      title: 'Page not found',
      body: 'The page you are looking for does not exist or has been moved.',
      back: 'Return home',
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
      reply: 'Reply',
      cancelReply: 'Cancel',
      replyTo: 'Replying to {{name}}',
      replySubmit: 'Post reply',
    },
  },
  zh: {
    nav: {
      home: '首页',
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
    notFound: {
      title: '页面未找到',
      body: '你正在查找的页面不存在或已被移除。',
      back: '返回首页',
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
      reply: '回复',
      cancelReply: '取消',
      replyTo: '回复 {{name}}',
      replySubmit: '发表回复',
    },
  },
} as const;

export type Translations = typeof translations[Lang];
