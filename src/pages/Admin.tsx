import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { trpc } from '@/providers/trpc-client';
import { useAdmin } from '@/hooks/useAdmin';
import { SEO } from '@/components/SEO';
import SecurityPanel from '@/components/admin/SecurityPanel';
import PostsPanel from '@/components/admin/PostsPanel';
import SiteSettingsPanel from '@/components/admin/SiteSettingsPanel';
import CommentsPanel from '@/components/admin/CommentsPanel';
import { Plus } from 'lucide-react';

type Tab = 'posts' | 'comments' | 'settings';

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, isLoading, logout } = useAdmin();
  const [tab, setTab] = useState<Tab>('posts');

  const { data: pendingCount } = trpc.comment.pendingCount.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (isLoading) return;
    if (!isAdmin) {
      navigate('/admin/login', { replace: true });
    }
  }, [isLoading, isAdmin, navigate]);

  if (isLoading || !isAdmin) {
    return null;
  }

  const tabs: Array<{ value: Tab; label: string; badge?: number }> = [
    { value: 'posts', label: 'Posts' },
    { value: 'comments', label: 'Comments', badge: pendingCount && pendingCount > 0 ? pendingCount : undefined },
    { value: 'settings', label: 'Site Settings' },
  ];

  return (
    <>
      <SEO title="Admin Dashboard" description="Manage articles and API keys" />
      <div className="min-h-screen pt-28 pb-24">
        <div className="max-w-[900px] mx-auto px-6 md:px-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <h1 className="font-display text-3xl text-foreground tracking-tight">
              Dashboard
            </h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin/new')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background font-mono text-xs rounded-sm hover:bg-foreground/90 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Post
              </button>
              <button
                onClick={async () => {
                  try {
                    await logout();
                    navigate('/admin/login');
                  } catch {
                    alert('Logout failed — check your connection and try again.');
                  }
                }}
                className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          <SecurityPanel />

          {/* Tab nav */}
          <div className="flex items-center gap-1 mb-6 border-b border-border/30">
            {tabs.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-4 py-2 font-mono text-xs tracking-wider uppercase transition-colors border-b-2 -mb-px ${
                  tab === t.value
                    ? 'text-foreground border-foreground'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                {t.label}
                {t.badge !== undefined && (
                  <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px]">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'posts' && <PostsPanel />}
          {tab === 'comments' && <CommentsPanel />}
          {tab === 'settings' && <SiteSettingsPanel />}
        </div>
      </div>
    </>
  );
}
