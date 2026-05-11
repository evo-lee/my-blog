import { Link } from 'react-router';
import { trpc } from '@/providers/trpc-client';
import { ConfirmButton } from '@/components/admin/ConfirmButton';
import { Trash2, Edit3, ExternalLink } from 'lucide-react';

export default function PostsPanel() {
  const { data: postsData, refetch } = trpc.post.adminList.useQuery({ page: 1, perPage: 50 });
  const deleteMutation = trpc.post.delete.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <div className="border border-border/30 rounded-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/30 bg-card/50">
            <th className="text-left px-4 py-3 font-mono text-[10px] tracking-wider uppercase text-muted-foreground">Title</th>
            <th className="text-left px-4 py-3 font-mono text-[10px] tracking-wider uppercase text-muted-foreground w-24">Category</th>
            <th className="text-left px-4 py-3 font-mono text-[10px] tracking-wider uppercase text-muted-foreground w-24">Date</th>
            <th className="text-left px-4 py-3 font-mono text-[10px] tracking-wider uppercase text-muted-foreground w-16">Status</th>
            <th className="text-right px-4 py-3 font-mono text-[10px] tracking-wider uppercase text-muted-foreground w-28">Actions</th>
          </tr>
        </thead>
        <tbody>
          {postsData?.items.map((post) => (
            <tr key={post.id} className="border-b border-border/20 hover:bg-card/30 transition-colors">
              <td className="px-4 py-3">
                <span className="font-display text-sm text-foreground">{post.title}</span>
                <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">/{post.slug}</span>
              </td>
              <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase">
                {post.category}
              </td>
              <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                {post.publishedDate}
              </td>
              <td className="px-4 py-3">
                {post.published ? (
                  <span className="font-mono text-[10px] text-green-400">Live</span>
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">Draft</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    to={`/article/${post.slug}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    to={`/admin/edit/${post.id}`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Link>
                  <ConfirmButton
                    message="Delete this post?"
                    onConfirm={() => deleteMutation.mutate({ id: post.id })}
                    title="Delete"
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </ConfirmButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
