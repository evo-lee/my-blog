import { useState } from 'react';
import { trpc } from '@/providers/trpc-client';
import { useTransientFlag } from '@/hooks/useTransientFlag';
import { Copy, Key, Shield, AlertTriangle } from 'lucide-react';

export default function SecurityPanel() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();

  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [copied, triggerCopied] = useTransientFlag(2000);
  const [copyFailed, triggerCopyFailed] = useTransientFlag(2500);
  const [twoFASaved, triggerTwoFASaved] = useTransientFlag(3000);
  const [twoFARemoved, triggerTwoFARemoved] = useTransientFlag(3000);

  const setup2FAMutation = trpc.auth.setup2FA.useMutation({
    onSuccess: () => {
      setTotpCode('');
    },
  });
  const verify2FAMutation = trpc.auth.verify2FA.useMutation({
    onSuccess: () => {
      setTotpCode('');
      setup2FAMutation.reset();
      utils.auth.me.invalidate();
      triggerTwoFASaved();
    },
  });
  const cancel2FAMutation = trpc.auth.cancel2FASetup.useMutation({
    onSuccess: () => {
      setTotpCode('');
      setup2FAMutation.reset();
    },
  });
  const disable2FAMutation = trpc.auth.disable2FA.useMutation({
    onSuccess: () => {
      setTotpCode('');
      setup2FAMutation.reset();
      utils.auth.me.invalidate();
      triggerTwoFARemoved();
    },
  });

  const generateKeyMutation = trpc.auth.generateApiKey.useMutation({
    onSuccess: (data) => {
      setShowApiKey(data.apiKey);
      utils.auth.me.invalidate();
    },
  });
  const revokeKeyMutation = trpc.auth.revokeApiKey.useMutation({
    onSuccess: () => {
      setShowApiKey(null);
      utils.auth.me.invalidate();
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      triggerCopied();
    } catch {
      triggerCopyFailed();
    }
  };

  const handleConfirm2FA = (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    verify2FAMutation.mutate({ code: totpCode });
  };

  return (
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

        {me?.has2FA ? (
          <div className="space-y-4">
            <p className="font-body text-sm text-muted-foreground">
              2FA is active. Future admin logins require a 6-digit authenticator code.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => disable2FAMutation.mutate()}
                disabled={disable2FAMutation.isPending}
                className="px-4 py-2 border border-red-500/30 text-red-400 font-mono text-xs rounded-sm hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {disable2FAMutation.isPending ? 'Removing...' : 'Remove 2FA'}
              </button>
              {twoFASaved && (
                <span className="font-mono text-[10px] text-nocturne-gold">
                  2FA enabled. Your next admin login will ask for a code.
                </span>
              )}
            </div>
            {disable2FAMutation.error && (
              <p className="font-mono text-[10px] text-red-400">
                {disable2FAMutation.error.message}
              </p>
            )}
          </div>
        ) : !setup2FAMutation.data ? (
          <div className="space-y-4">
            <p className="font-body text-sm text-muted-foreground">
              Enable 2FA to protect your admin account. Scan the QR code, then confirm with a 6-digit code before 2FA is turned on.
            </p>
            <button
              onClick={() => setup2FAMutation.mutate()}
              disabled={setup2FAMutation.isPending}
              className="px-4 py-2 border border-border rounded-sm font-mono text-xs text-foreground hover:bg-card transition-colors"
            >
              {setup2FAMutation.isPending ? 'Generating...' : 'Setup 2FA'}
            </button>
            {twoFARemoved && (
              <p className="font-mono text-[10px] text-nocturne-gold">
                2FA removed. You can set it up again.
              </p>
            )}
            {setup2FAMutation.error && (
              <p className="font-mono text-[10px] text-red-400">
                {setup2FAMutation.error.message}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleConfirm2FA} className="mt-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <img
                src={setup2FAMutation.data.qrUrl}
                alt="2FA QR Code"
                className="w-40 h-40 rounded-sm bg-white"
              />
              <div className="space-y-3 flex-1">
                <p className="font-body text-sm text-muted-foreground">
                  Scan this QR code with your authenticator app, then enter the current 6-digit code to finish setup.
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  Secret: <code className="text-foreground bg-card px-1 py-0.5 rounded break-all">{setup2FAMutation.data.secret}</code>
                </p>
              </div>
            </div>
            <div className="space-y-2 max-w-xs">
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2 bg-card border border-border/30 rounded-sm font-mono text-lg tracking-widest text-center text-foreground focus:outline-none focus:border-foreground/40"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={verify2FAMutation.isPending || totpCode.length !== 6}
                className="px-4 py-2 bg-foreground text-background font-mono text-xs rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                {verify2FAMutation.isPending ? 'Verifying...' : 'Confirm 2FA'}
              </button>
              <button
                type="button"
                onClick={() => cancel2FAMutation.mutate()}
                disabled={cancel2FAMutation.isPending}
                className="px-4 py-2 border border-border rounded-sm font-mono text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors disabled:opacity-50"
              >
                Cancel setup
              </button>
            </div>
            {verify2FAMutation.error && (
              <p className="font-mono text-[10px] text-red-400">
                {verify2FAMutation.error.message}
              </p>
            )}
            {cancel2FAMutation.error && (
              <p className="font-mono text-[10px] text-red-400">
                {cancel2FAMutation.error.message}
              </p>
            )}
            <p className="font-mono text-xs text-muted-foreground">
              2FA will not be enabled until this code is confirmed.
            </p>
          </form>
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
            {copyFailed && (
              <p className="font-mono text-[10px] text-red-400 mt-1">Copy failed — select the text manually.</p>
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
  );
}
