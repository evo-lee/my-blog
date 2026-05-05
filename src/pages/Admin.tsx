import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { trpc } from '@/providers/trpc';
import { useAdmin } from '@/hooks/useAdmin';
import { SEO } from '@/components/SEO';
import { Plus, Trash2, Edit3, ExternalLink, Copy, Key, Shield, AlertTriangle } from 'lucide-react';

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAdmin();

  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check setup status
  const { data: setupData } = trpc.auth.isSetup.useQuery();
  const { data: me } = trpc.auth.me.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { data: postsData, refetch } = trpc.post.adminList.useQuery(
    { page: 1, perPage: 50 },
    { enabled: isAdmin }
  );

  // 2FA setup
  const setup2FAMutation = trpc.auth.setup2FA.useMutation();

  // API Key
  const generateKeyMutation = trpc.auth.generateApiKey.useMutation({
    onSuccess: (data) => {
      setShowApiKey(data.apiKey);
    },
  });
  const revokeKeyMutation = trpc.auth.revokeApiKey.useMutation({
    onSuccess: () => {
      setShowApiKey(null);
    },
  });

  // Delete post
  const deleteMutation = trpc.post.delete.useMutation({
    onSuccess: () => refetch(),
  });

  // Redirect if not setup
  if (setupData?.isSetup) {
    navigate('/admin/setup');
    return null;
  }

  // Redirect if not logged in
  if (!isAdmin && !setupData?.isSetup) {
    navigate('/admin/login');
    return null;
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
                onClick={() => { logout(); navigate('/admin/login'); }}
                className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Security Section */}
          <div className="mb-10 space-y-6">
            {/* 2FA Status */}
            <div className="border border-border/30 rounded-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-4 h-4 text-nocturne-gold" />
                <h2 className="font-mono text-xs tracking-wider uppercase text-foreground">
                  Two-Factor Authentication
                </h2>
                {me?.has2FA ? (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                    Enabled
                  </span>
                ) : (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Not set up
                  </span>
                )}
              </div>

              {!me?.has2FA && (
                <div className="space-y-4">
                  <p className="font-body text-sm text-muted-foreground">
                    Enable 2FA to protect your admin account. Scan the QR code with Google Authenticator or Authy.
                  </p>
                  <button
                    onClick={() => setup2FAMutation.mutate()}
                    className="px-4 py-2 border border-border rounded-sm font-mono text-xs text-foreground hover:bg-card transition-colors"
                  >
                    Setup 2FA
                  </button>
                </div>
              )}

              {setup2FAMutation.data && (
                <div className="mt-4 space-y-4">
                  <img src={setup2FAMutation.data.qrUrl} alt="2FA QR Code" className="w-40 h-40 rounded-sm" />
                  <p className="font-mono text-xs text-muted-foreground">
                    Secret: <code className="text-foreground bg-card px-1 py-0.5 rounded">{setup2FAMutation.data.secret}</code>
                  </p>
                </div>
              )}
            </div>

            {/* API Key */}
            <div className="border border-border/30 rounded-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-4 h-4 text-nocturne-gold" />
                <h2 className="font-mono text-xs tracking-wider uppercase text-foreground">
                  API Key
                </h2>
                {me?.apiKey ? (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                    Active
                  </span>
                ) : (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground">
                    None
                  </span>
                )}
              </div>

              <p className="font-body text-sm text-muted-foreground mb-4">
                Use this API Key to publish articles from your local terminal via CLI.
              </p>

              {showApiKey && (
                <div className="mb-4 p-3 bg-card rounded-sm border border-nocturne-gold/30">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs text-foreground flex-1 break-all">
                      {showApiKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(showApiKey)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  {copied && (
                    <p className="font-mono text-[10px] text-nocturne-gold mt-1">Copied!</p>
                  )}
                  <p className="font-mono text-[10px] text-red-400 mt-2">
                    Save this key now — it will not be shown again.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => generateKeyMutation.mutate()}
                  disabled={generateKeyMutation.isPending}
                  className="px-4 py-2 bg-foreground text-background font-mono text-xs rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  {generateKeyMutation.isPending ? 'Generating...' : me?.apiKey ? 'Regenerate Key' : 'Generate Key'}
                </button>
                {me?.apiKey && (
                  <button
                    onClick={() => revokeKeyMutation.mutate()}
                    className="px-4 py-2 border border-red-500/30 text-red-400 font-mono text-xs rounded-sm hover:bg-red-500/10 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Posts table */}
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
                        <button
                          onClick={() => {
                            if (confirm('Delete this post?')) {
                              deleteMutation.mutate({ id: post.id });
                            }
                          }}
                          className="text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
