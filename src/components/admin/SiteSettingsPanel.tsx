import { useState } from 'react';
import { trpc } from '@/providers/trpc';
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
}

const FIELDS: readonly FieldDef[] = [
  { key: 'siteTitle', label: 'Site Title', hint: 'Shown in header and footer' },
  { key: 'heroTitleEn', label: 'Hero Title (EN)' },
  { key: 'heroTitleZh', label: 'Hero Title (ZH)' },
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

type Form = Record<FieldKey, string>;

const EMPTY_FORM = FIELDS.reduce(
  (acc, f) => ({ ...acc, [f.key]: '' }),
  {} as Form
);

function toForm(src: Partial<Record<FieldKey, string>>): Form {
  return FIELDS.reduce(
    (acc, f) => ({ ...acc, [f.key]: src[f.key] ?? '' }),
    {} as Form
  );
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

  const handleChange = (key: FieldKey, value: string) => {
    setForm((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(form);
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

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={updateMutation.isPending || !dirty}
          className="px-4 py-2 bg-foreground text-background font-mono text-xs rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        {savedFlag && <span className="font-mono text-[10px] text-nocturne-gold">Saved.</span>}
        {updateMutation.error && (
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
