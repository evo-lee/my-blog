import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc-client";
import {
  buildAnalyticsPayloads,
  type AnalyticsPayload,
} from "@/lib/analyticsLoader";

// Mounts once near the top of the tree. In production, reads site settings
// and injects whichever analytics integrations are configured (GA, Umami,
// or both). Idempotent — sentinels prevent double-init on re-render. Cleans
// up its own injected <script> nodes when the active set changes;
// third-party globals like window.gtag are left in place because they
// can't be fully torn down.

const SCRIPT_MARK = "data-analytics-loader";

function signatureOf(payloads: AnalyticsPayload[]): string {
  return payloads
    .map((p) => `${p.sentinelKey}:${p.sentinelValue}`)
    .sort()
    .join("|");
}

export default function AnalyticsLoader() {
  const { data } = trpc.settings.get.useQuery();
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!data) return;

    const payloads = buildAnalyticsPayloads({
      gaMeasurementId: data.gaMeasurementId,
      umamiSiteId: data.umamiSiteId,
      umamiScriptUrl: data.umamiScriptUrl,
    });

    const signature = signatureOf(payloads);
    if (signature === lastSignatureRef.current) return;

    // Active set changed. Strip prior injected nodes + sentinels so the
    // next pass can re-inject cleanly.
    document
      .querySelectorAll(`script[${SCRIPT_MARK}]`)
      .forEach((n) => n.remove());
    const w = window as unknown as Record<string, unknown>;
    delete w.__gaInit;
    delete w.__umamiInit;
    lastSignatureRef.current = "";

    for (const payload of payloads) {
      if (w[payload.sentinelKey] === payload.sentinelValue) continue;
      w[payload.sentinelKey] = payload.sentinelValue;

      if (payload.inlineBootstrap) {
        const inline = document.createElement("script");
        inline.setAttribute(SCRIPT_MARK, payload.provider);
        inline.textContent = payload.inlineBootstrap;
        document.head.appendChild(inline);
      }

      const ext = document.createElement("script");
      ext.setAttribute(SCRIPT_MARK, payload.provider);
      ext.async = true;
      if (payload.provider === "umami") ext.defer = true;
      if (payload.dataset) {
        for (const [k, v] of Object.entries(payload.dataset)) {
          ext.dataset[k] = v;
        }
      }
      ext.src = payload.src;
      ext.onerror = () => {
        // Allow re-init on the next data change if the network fetch failed.
        delete w[payload.sentinelKey];
      };
      document.head.appendChild(ext);
    }

    lastSignatureRef.current = signature;
  }, [data]);

  return null;
}
