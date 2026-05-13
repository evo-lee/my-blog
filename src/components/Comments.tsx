import { useState } from 'react';
import { trpc } from '@/providers/trpc-client';
import { useI18n } from '@/i18n/useI18n';
import { useAdmin } from '@/hooks/useAdmin';
import { formatCommentDate } from '@/lib/formatDate';
import { MessageSquare } from 'lucide-react';
import PixelAvatar from '@/components/PixelAvatar';

interface Props {
  postId: number;
}

interface ReplyRow {
  id: number;
  authorName: string;
  content: string;
  createdAt: Date | null;
}

export default function Comments({ postId }: Props) {
  const { t, lang } = useI18n();
  const { isAdmin } = useAdmin();
  const utils = trpc.useUtils();

  const { data: comments } = trpc.comment.listForPost.useQuery({ postId });

  // Top-level form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [justSubmitted, setJustSubmitted] = useState(false);

  // Reply form state — only one open at a time
  const [activeReplyId, setActiveReplyId] = useState<number | null>(null);
  const [replyName, setReplyName] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [replyWebsite, setReplyWebsite] = useState('');
  const [justReplied, setJustReplied] = useState(false);

  const submit = trpc.comment.submit.useMutation({
    onSuccess: (_data, vars) => {
      if (vars.parentId !== undefined) {
        setReplyName('');
        setReplyEmail('');
        setReplyContent('');
        setReplyWebsite('');
        setActiveReplyId(null);
        setJustReplied(true);
      } else {
        setName('');
        setEmail('');
        setContent('');
        setWebsite('');
        setJustSubmitted(true);
      }
      utils.comment.listForPost.invalidate({ postId });
      if (isAdmin) utils.comment.pendingCount.invalidate();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    submit.mutate({
      postId,
      authorName: name.trim(),
      authorEmail: email.trim() || undefined,
      content: content.trim(),
      website,
    });
  };

  const handleReplySubmit = (e: React.FormEvent, parentId: number) => {
    e.preventDefault();
    if (!replyName.trim() || !replyContent.trim()) return;
    submit.mutate({
      postId,
      parentId,
      authorName: replyName.trim(),
      authorEmail: replyEmail.trim() || undefined,
      content: replyContent.trim(),
      website: replyWebsite,
    });
  };

  const totalCount =
    (comments?.length ?? 0) +
    (comments?.reduce((acc, c) => acc + c.replies.length, 0) ?? 0);

  return (
    <section className="mt-16 pt-12 border-t border-border/30">
      <div className="flex items-center gap-3 mb-8">
        <MessageSquare className="w-4 h-4 text-nocturne-gold" />
        <h2 className="font-display text-xl text-foreground tracking-tight">
          {t.comments.title}
          {totalCount > 0 && (
            <span className="font-mono text-xs text-muted-foreground ml-2">
              ({totalCount})
            </span>
          )}
        </h2>
      </div>

      {/* Comment list */}
      {!comments || comments.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground mb-10">
          {t.comments.empty}
        </p>
      ) : (
        <ul className="space-y-6 mb-12">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentRow
                authorName={c.authorName}
                createdAt={c.createdAt}
                content={c.content}
                lang={lang}
              />

              {/* Reply button + inline form */}
              <div className="ml-11 mt-2">
                {activeReplyId === c.id ? (
                  <button
                    type="button"
                    onClick={() => setActiveReplyId(null)}
                    className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.comments.cancelReply}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveReplyId(c.id);
                      setJustReplied(false);
                    }}
                    className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.comments.reply}
                  </button>
                )}
              </div>

              {activeReplyId === c.id && (
                <form
                  onSubmit={(e) => handleReplySubmit(e, c.id)}
                  className="ml-11 mt-3 space-y-3 border-l-2 border-border/30 pl-4"
                >
                  <p className="font-mono text-[10px] text-muted-foreground tracking-wide">
                    {t.comments.replyTo.replace('{{name}}', c.authorName)}
                  </p>

                  <div aria-hidden="true" className="absolute -left-[9999px] w-0 h-0 overflow-hidden">
                    <label>
                      Website
                      <input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={replyWebsite}
                        onChange={(e) => setReplyWebsite(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      maxLength={50}
                      placeholder={t.comments.name}
                      value={replyName}
                      onChange={(e) => setReplyName(e.target.value)}
                      className="bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
                    />
                    <input
                      type="email"
                      maxLength={100}
                      placeholder={t.comments.email}
                      value={replyEmail}
                      onChange={(e) => setReplyEmail(e.target.value)}
                      className="bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
                    />
                  </div>

                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    placeholder={t.comments.content}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    className="w-full bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40 resize-y"
                  />

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={submit.isPending || !replyName.trim() || !replyContent.trim()}
                      className="px-3 py-1.5 bg-foreground text-background font-mono text-xs rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submit.isPending ? t.comments.submitting : t.comments.replySubmit}
                    </button>
                    {submit.error && submit.variables?.parentId === c.id && (
                      <span className="font-mono text-[10px] text-red-400">
                        {submit.error.message}
                      </span>
                    )}
                  </div>
                </form>
              )}

              {justReplied && activeReplyId === null && (
                // Show success near the last-clicked comment block by sitting under it.
                // Cleared when the next reply form opens.
                null
              )}

              {/* Replies (indented) */}
              {c.replies.length > 0 && (
                <ul className="ml-11 mt-4 space-y-4 border-l border-border/30 pl-4">
                  {c.replies.map((r: ReplyRow) => (
                    <li key={r.id}>
                      <CommentRow
                        authorName={r.authorName}
                        createdAt={r.createdAt}
                        content={r.content}
                        lang={lang}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Top-level submit form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="font-mono text-[10px] text-muted-foreground tracking-wide">
          {t.comments.moderationNote}
        </p>

        {/* Honeypot — visually hidden */}
        <div aria-hidden="true" className="absolute -left-[9999px] w-0 h-0 overflow-hidden">
          <label>
            Website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            required
            maxLength={50}
            placeholder={t.comments.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
          />
          <input
            type="email"
            maxLength={100}
            placeholder={t.comments.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
          />
        </div>

        <textarea
          required
          rows={4}
          maxLength={2000}
          placeholder={t.comments.content}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40 resize-y"
        />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submit.isPending || !name.trim() || !content.trim()}
            className="px-4 py-2 bg-foreground text-background font-mono text-xs rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submit.isPending ? t.comments.submitting : t.comments.submit}
          </button>
          {(justSubmitted || justReplied) && !submit.isPending && (
            <span className="font-mono text-[10px] text-nocturne-gold">
              {t.comments.pending}
            </span>
          )}
          {submit.error && submit.variables?.parentId === undefined && (
            <span className="font-mono text-[10px] text-red-400">
              {submit.error.message}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

function CommentRow({
  authorName,
  createdAt,
  content,
  lang,
}: {
  authorName: string;
  createdAt: Date | null;
  content: string;
  lang: 'en' | 'zh';
}) {
  return (
    <div className="flex gap-3">
      <PixelAvatar seed={authorName} size={32} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="font-body text-sm font-medium text-foreground">
            {authorName}
          </span>
          <time className="font-mono text-[10px] text-muted-foreground">
            {formatCommentDate(createdAt, lang)}
          </time>
        </div>
        <p className="font-body text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </p>
      </div>
    </div>
  );
}
