import { useState } from 'react';
import { useNavigate } from 'react-router';
import { trpc } from '@/providers/trpc';
import { useAdmin } from '@/hooks/useAdmin';
import { SEO } from '@/components/SEO';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAdmin();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'password' | '2fa'>('password');
  const [tempToken, setTempToken] = useState('');
  const [code, setCode] = useState('');

  const step1Mutation = trpc.auth.loginStep1.useMutation({
    onSuccess: (data) => {
      if (data.require2FA && data.tempToken) {
        setTempToken(data.tempToken);
        setStep('2fa');
      } else if (data.user) {
        login({ ...data.user, apiKey: false, has2FA: false });
        navigate('/admin');
      }
    },
    onError: (err) => setError(err.message),
  });

  const step2Mutation = trpc.auth.loginStep2.useMutation({
    onSuccess: (data) => {
      if (data.user) {
        login({ ...data.user, apiKey: false, has2FA: true });
        navigate('/admin');
      }
    },
    onError: (err) => setError(err.message),
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    step1Mutation.mutate({ username, password });
  };

  const handle2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    step2Mutation.mutate({ tempToken, code });
  };

  return (
    <>
      <SEO title="Admin Login" description="Login to admin dashboard" />
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl text-foreground mb-2 tracking-tight text-center">
            {step === 'password' ? 'Login' : 'Two-Factor Auth'}
          </h1>
          <p className="font-body text-sm text-muted-foreground text-center mb-8">
            {step === 'password'
              ? 'Enter your credentials'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>

          {step === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                  placeholder="Username"
                  required
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
                  placeholder="Password"
                  required
                />
              </div>

              {error && (
                <p className="font-mono text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={step1Mutation.isPending}
                className="w-full py-3 bg-foreground text-background font-mono text-sm font-medium rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                {step1Mutation.isPending ? 'Verifying...' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FASubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                  6-Digit Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 bg-card border border-border rounded-sm font-mono text-lg text-center text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50 tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              {error && (
                <p className="font-mono text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={step2Mutation.isPending}
                className="w-full py-3 bg-foreground text-background font-mono text-sm font-medium rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                {step2Mutation.isPending ? 'Verifying...' : 'Login'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('password'); setError(''); }}
                className="w-full py-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to password
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
