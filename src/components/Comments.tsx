import { useState } from 'react';
import { trpc } from '@/providers/trpc-client';
import { useI18n } from '@/i18n/useI18n';
import { useAdmin } from '@/hooks/useAdmin';
import { formatCommentDate } from '@/lib/formatDate';
import { MessageSquare } from 'lucide-react';

interface Props {
  postId: number;
}

export default function Comments({ postId }: Props) {
  const { t, lang } = useI18n();
  const { isAdmin } = useAdmin();
  const utils = trpc.useUtils();

  const { data: comments } = trpc.comment.listForPost.useQuery({ postId });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [justSubmitted, setJustSubmitted] = useState(false);

  const submit = trpc.comment.submit.useMutation({
    onSuccess: () => {
      setName('');
      setEmail('');
      setContent('');
      setWebsite('');
      setJustSubmitted(true);
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

  return (
    <section className="mt-16 pt-12 border-t border-border/30">
      <div className="flex items-center gap-3 mb-8">
        <MessageSquare className="w-4 h-4 text-nocturne-gold" />
        <h2 className="font-display text-xl text-foreground tracking-tight">
          {t.comments.title}
          {comments && comments.length > 0 && (
            <span className="font-mono text-xs text-muted-foreground ml-2">
              ({comments.length})
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
            <li key={c.id} className="border-l-2 border-border/40 pl-4">
              <div className="flex items-baseline gap-3 mb-1.5">
                <span className="font-body text-sm font-medium text-foreground">
                  {c.authorName}
                </span>
                <time className="font-mono text-[10px] text-muted-foreground">
                  {formatCommentDate(c.createdAt, lang)}
                </time>
              </div>
              <p className="font-body text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                {c.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Submit form */}
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
          {justSubmitted && !submit.isPending && (
            <span className="font-mono text-[10px] text-nocturne-gold">
              {t.comments.pending}
            </span>
          )}
          {submit.error && (
            <span className="font-mono text-[10px] text-red-400">
              {submit.error.message}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
