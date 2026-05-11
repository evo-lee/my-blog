import { useState } from 'react';
import { useNavigate } from 'react-router';
import { trpc } from '@/providers/trpc-client';
import { SEO } from '@/components/SEO';

export default function AdminSetup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const utils = trpc.useUtils();
  const setupMutation = trpc.auth.setup.useMutation({
    onSuccess: async () => {
      await utils.auth.isSetup.invalidate();
      navigate('/');
    },
    onError: (err) => {
      setError(err.message);
      setIsSubmitting(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);
    setupMutation.mutate({ username, password });
  };

  return (
    <>
      <SEO title="Setup Admin" description="Initialize admin account" />
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl text-foreground mb-2 tracking-tight text-center">
            Setup
          </h1>
          <p className="font-body text-sm text-muted-foreground text-center mb-8">
            Create your admin account
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                placeholder="admin"
                required
                minLength={3}
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                placeholder="Min 6 characters"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                placeholder="Confirm password"
                required
              />
            </div>

            {error && (
              <p className="font-mono text-xs text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-foreground text-background font-mono text-sm font-medium rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Admin Account'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
