import { useState } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/providers/trpc';
import { useI18n } from '@/i18n/useI18n';
import { formatCommentDateTime } from '@/lib/formatDate';
import { ConfirmButton } from '@/components/admin/ConfirmButton';
import { Check, X, Undo2 } from 'lucide-react';

type Status = 'pending' | 'approved' | 'all';

export default function CommentsPanel() {
  const [status, setStatus] = useState<Status>('pending');
  const { lang } = useI18n();

  const utils = trpc.useUtils();
  const { data: comments, isLoading } = trpc.comment.adminList.useQuery({ status });

  const invalidate = () => {
    utils.comment.adminList.invalidate();
    utils.comment.pendingCount.invalidate();
  };

  const approveMutation = trpc.comment.approve.useMutation({ onSuccess: invalidate });
  const unapproveMutation = trpc.comment.unapprove.useMutation({ onSuccess: invalidate });
  const deleteMutation = trpc.comment.delete.useMutation({ onSuccess: invalidate });

  const tabs: Array<{ value: Status; label: string }> = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="border border-border/30 rounded-sm p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-mono text-xs tracking-wider uppercase text-foreground">Comments</h2>
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`px-3 py-1 font-mono text-[10px] tracking-wider uppercase rounded-sm transition-colors ${
                status === tab.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="font-mono text-xs text-muted-foreground">Loading…</div>
      ) : !comments || comments.length === 0 ? (
        <div className="font-mono text-xs text-muted-foreground">No comments.</div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="border border-border/30 rounded-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-body text-sm text-foreground font-medium">
                      {c.authorName}
                    </span>
                    {c.authorEmail && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {c.authorEmail}
                      </span>
                    )}
                    {c.approved ? (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-green-500/10 text-green-400">
                        approved
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-yellow-500/10 text-yellow-400">
                        pending
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-1">
                    on{' '}
                    {c.postSlug ? (
                      <Link
                        to={`/article/${c.postSlug}`}
                        target="_blank"
                        className="hover:text-foreground transition-colors underline"
                      >
                        {c.postTitle ?? c.postSlug}
                      </Link>
                    ) : (
                      <span>(post deleted)</span>
                    )}
                    {' · '}
                    {formatCommentDateTime(c.createdAt, lang)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {c.approved ? (
                    <button
                      onClick={() => unapproveMutation.mutate({ id: c.id })}
                      title="Unapprove"
                      className="text-muted-foreground hover:text-yellow-400 transition-colors"
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => approveMutation.mutate({ id: c.id })}
                      title="Approve"
                      className="text-muted-foreground hover:text-green-400 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <ConfirmButton
                    message="Delete this comment?"
                    onConfirm={() => deleteMutation.mutate({ id: c.id })}
                    title="Delete"
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </ConfirmButton>
                </div>
              </div>
              <p className="font-body text-sm text-foreground/90 whitespace-pre-wrap break-words">
                {c.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
