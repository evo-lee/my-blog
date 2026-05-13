import { useState } from 'react';
import { trpc } from '@/providers/trpc-client';
import { useTransientFlag } from '@/hooks/useTransientFlag';

type FieldKey =
  | 'siteTitle'
  | 'heroTitleEn'
  | 'heroTitleZh'
  | 'heroSubtitleEn'
  | 'heroSubtitleZh'
  | 'icpNumber'
  | 'publicSecurityNumber'
  | 'copyrightEn'
  | 'copyrightZh';

interface FieldDef {
  key: FieldKey;
  label: string;
  hint?: string;
  multiline?: boolean;
  required?: boolean;
}

const FIELDS: readonly FieldDef[] = [
  { key: 'siteTitle', label: 'Site Title', hint: 'Shown in header and footer', required: true },
  { key: 'heroTitleEn', label: 'Hero Title (EN)', required: true },
  { key: 'heroTitleZh', label: 'Hero Title (ZH)', required: true },
  { key: 'heroSubtitleEn', label: 'Hero Subtitle (EN)', multiline: true },
  { key: 'heroSubtitleZh', label: 'Hero Subtitle (ZH)', multiline: true },
  { key: 'icpNumber', label: 'ICP 备案号', hint: 'e.g. 京ICP备12345678号-1 (leave blank to hide)' },
  {
    key: 'publicSecurityNumber',
    label: '公网安备号',
    hint: 'e.g. 京公网安备 11000002000001号 (leave blank to hide)',
  },
  { key: 'copyrightEn', label: 'Copyright (EN)' },
  { key: 'copyrightZh', label: 'Copyright (ZH)' },
];

const REQUIRED_KEYS = FIELDS.filter((f) => f.required).map((f) => f.key);

interface Form extends Record<FieldKey, string> {
  gaEnabled: boolean;
  gaMeasurementId: string;
  umamiEnabled: boolean;
  umamiSiteId: string;
  umamiScriptUrl: string;
}

const EMPTY_FORM: Form = {
  ...FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {} as Record<FieldKey, string>),
  gaEnabled: false,
  gaMeasurementId: '',
  umamiEnabled: false,
  umamiSiteId: '',
  umamiScriptUrl: '',
};

function toForm(src: Partial<Record<FieldKey, string>> & {
  gaMeasurementId?: string;
  umamiSiteId?: string;
  umamiScriptUrl?: string;
}): Form {
  const text = FIELDS.reduce(
    (acc, f) => ({ ...acc, [f.key]: src[f.key] ?? '' }),
    {} as Record<FieldKey, string>,
  );
  const gaId = src.gaMeasurementId ?? '';
  const umamiId = src.umamiSiteId ?? '';
  const umamiUrl = src.umamiScriptUrl ?? '';
  return {
    ...text,
    gaEnabled: gaId !== '',
    gaMeasurementId: gaId,
    umamiEnabled: umamiId !== '' || umamiUrl !== '',
    umamiSiteId: umamiId,
    umamiScriptUrl: umamiUrl,
  };
}

function SiteSettingsForm({ initial }: { initial: Form }) {
  const utils = trpc.useUtils();
  const [savedFlag, triggerSaved] = useTransientFlag(2000);
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setDirty(false);
      triggerSaved();
    },
  });

  const [form, setForm] = useState<Form>(() => initial);
  const [dirty, setDirty] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const handleChange = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
    setDirty(true);
    setClientError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const blank = REQUIRED_KEYS.filter((k) => !form[k].trim());
    if (blank.length > 0) {
      const labels = blank
        .map((k) => FIELDS.find((f) => f.key === k)?.label ?? k)
        .join(', ');
      setClientError(`Required: ${labels}`);
      return;
    }
    setClientError(null);

    // Disabled toggles clear their fields on save so a stale id can't sneak
    // back when the toggle is flipped on again later.
    const payload = {
      ...FIELDS.reduce(
        (acc, f) => ({ ...acc, [f.key]: form[f.key] }),
        {} as Record<FieldKey, string>,
      ),
      gaMeasurementId: form.gaEnabled ? form.gaMeasurementId.trim() : '',
      umamiSiteId: form.umamiEnabled ? form.umamiSiteId.trim() : '',
      umamiScriptUrl: form.umamiEnabled ? form.umamiScriptUrl.trim() : '',
    };
    updateMutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="border border-border/30 rounded-sm p-5 space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="font-mono text-xs tracking-wider uppercase text-foreground">Site Settings</h2>
      </div>

      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block">
            {f.label}
            {f.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {f.multiline ? (
            <textarea
              value={form[f.key]}
              onChange={(e) => handleChange(f.key, e.target.value)}
              rows={2}
              className="w-full bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40 resize-y"
            />
          ) : (
            <input
              type="text"
              required={f.required}
              value={form[f.key]}
              onChange={(e) => handleChange(f.key, e.target.value)}
              className="w-full bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
            />
          )}
          {f.hint && (
            <p className="font-mono text-[10px] text-muted-foreground/70">{f.hint}</p>
          )}
        </div>
      ))}

      <div className="border-t border-border/20 pt-5 space-y-5">
        <h3 className="font-mono text-[10px] tracking-wider uppercase text-foreground/80">Analytics</h3>
        <p className="font-mono text-[10px] text-muted-foreground/70 -mt-3">
          Each integration runs independently. Loader only fires in production builds.
        </p>

        {/* Google Analytics */}
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.gaEnabled}
              onChange={(e) => handleChange('gaEnabled', e.target.checked)}
            />
            <span className="font-mono text-[10px] tracking-wider uppercase text-foreground/80">
              Google Analytics 4
            </span>
          </label>
          {form.gaEnabled && (
            <div className="space-y-1.5 pl-6">
              <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block">
                Measurement ID
              </label>
              <input
                type="text"
                value={form.gaMeasurementId}
                onChange={(e) => handleChange('gaMeasurementId', e.target.value)}
                placeholder="G-ABC1234567"
                className="w-full bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
              />
              <p className="font-mono text-[10px] text-muted-foreground/70">
                GA4 ID, e.g. <code>G-ABC1234567</code>.
              </p>
            </div>
          )}
        </div>

        {/* Umami */}
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.umamiEnabled}
              onChange={(e) => handleChange('umamiEnabled', e.target.checked)}
            />
            <span className="font-mono text-[10px] tracking-wider uppercase text-foreground/80">
              Umami
            </span>
          </label>
          {form.umamiEnabled && (
            <div className="space-y-3 pl-6">
              <div className="space-y-1.5">
                <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block">
                  Site ID
                </label>
                <input
                  type="text"
                  value={form.umamiSiteId}
                  onChange={(e) => handleChange('umamiSiteId', e.target.value)}
                  placeholder="11111111-2222-3333-4444-555555555555"
                  className="w-full bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
                />
                <p className="font-mono text-[10px] text-muted-foreground/70">UUID from your Umami dashboard.</p>
              </div>
              <div className="space-y-1.5">
                <label className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground block">
                  Script URL
                </label>
                <input
                  type="text"
                  value={form.umamiScriptUrl}
                  onChange={(e) => handleChange('umamiScriptUrl', e.target.value)}
                  placeholder="https://umami.example.com/script.js"
                  className="w-full bg-card border border-border/30 rounded-sm px-3 py-2 font-body text-sm text-foreground focus:outline-none focus:border-foreground/40"
                />
                <p className="font-mono text-[10px] text-muted-foreground/70">https:// only.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={updateMutation.isPending || !dirty}
          className="px-4 py-2 bg-foreground text-background font-mono text-xs rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {savedFlag && <span className="font-mono text-[10px] text-nocturne-gold">Saved.</span>}
        {clientError && (
          <span className="font-mono text-[10px] text-red-400">{clientError}</span>
        )}
        {updateMutation.error && !clientError && (
          <span className="font-mono text-[10px] text-red-400">
            {updateMutation.error.message}
          </span>
        )}
      </div>
    </form>
  );
}

export default function SiteSettingsPanel() {
  const { data, isLoading } = trpc.settings.get.useQuery();

  if (isLoading && !data) {
    return <div className="font-mono text-xs text-muted-foreground">Loading…</div>;
  }

  return <SiteSettingsForm initial={data ? toForm(data) : EMPTY_FORM} />;
}
