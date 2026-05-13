// Pure helpers backing src/components/AnalyticsLoader.tsx. GA and Umami
// load independently — both can be on at once. Each helper returns null
// when its integration is disabled (= identifier blank).

export interface AnalyticsConfig {
  gaMeasurementId: string;
  umamiSiteId: string;
  umamiScriptUrl: string;
}

export interface AnalyticsPayload {
  provider: "google" | "umami";
  src: string;
  dataset?: Record<string, string>;
  // Runs before the external script. For GA this seeds window.gtag /
  // dataLayer so the external script attaches to the right config.
  inlineBootstrap?: string;
  // Stable per-config sentinel; the loader uses it to avoid double-injecting.
  sentinelKey: "__gaInit" | "__umamiInit";
  sentinelValue: string;
}

export function buildGooglePayload(
  gaMeasurementId: string,
): AnalyticsPayload | null {
  const id = gaMeasurementId.trim();
  if (!id) return null;
  return {
    provider: "google",
    src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
    sentinelKey: "__gaInit",
    sentinelValue: id,
    // send_page_view is off because src/hooks/usePageTracking.ts owns
    // route tracking via window.gtag('event', 'page_view', …).
    inlineBootstrap: `
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', ${JSON.stringify(id)}, { send_page_view: false });
`.trim(),
  };
}

export function buildUmamiPayload(
  umamiSiteId: string,
  umamiScriptUrl: string,
): AnalyticsPayload | null {
  const id = umamiSiteId.trim();
  const url = umamiScriptUrl.trim();
  if (!id || !url) return null;
  return {
    provider: "umami",
    src: url,
    dataset: { websiteId: id },
    sentinelKey: "__umamiInit",
    sentinelValue: id,
  };
}

export function buildAnalyticsPayloads(
  cfg: AnalyticsConfig,
): AnalyticsPayload[] {
  return [
    buildGooglePayload(cfg.gaMeasurementId),
    buildUmamiPayload(cfg.umamiSiteId, cfg.umamiScriptUrl),
  ].filter((p): p is AnalyticsPayload => p !== null);
}
