import { z } from "zod";

// Two independent integrations. Each toggles ON when its identifier is
// non-empty (and, for Umami, its script URL is also set). Both can run
// side-by-side; both can be off.

const GA_ID_RE = /^G-[A-Z0-9]{6,}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AnalyticsInput {
  gaMeasurementId: string;
  umamiSiteId: string;
  umamiScriptUrl: string;
}

// Validate + normalize. Blank values are valid (= disabled). Throws ZodError
// on malformed non-blank values.
export function normalizeAnalytics(input: AnalyticsInput): AnalyticsInput {
  const issues: { path: (string | number)[]; message: string }[] = [];

  const gaId = input.gaMeasurementId.trim();
  if (gaId !== "" && !GA_ID_RE.test(gaId)) {
    issues.push({
      path: ["gaMeasurementId"],
      message: "Google Analytics ID must look like 'G-XXXXXXXX' (leave blank to disable)",
    });
  }

  const umamiId = input.umamiSiteId.trim();
  let umamiUrl = input.umamiScriptUrl.trim();

  // Both Umami fields must be provided together, or both blank.
  if (umamiId !== "" || umamiUrl !== "") {
    if (umamiId === "") {
      issues.push({
        path: ["umamiSiteId"],
        message: "Umami site ID is required when a script URL is set",
      });
    } else if (!UUID_RE.test(umamiId)) {
      issues.push({
        path: ["umamiSiteId"],
        message: "Umami site ID must be a UUID",
      });
    }

    if (umamiUrl === "") {
      issues.push({
        path: ["umamiScriptUrl"],
        message: "Umami script URL is required when a site ID is set",
      });
    } else {
      try {
        const parsed = new URL(umamiUrl);
        if (parsed.protocol !== "https:") {
          issues.push({
            path: ["umamiScriptUrl"],
            message: "Umami script URL must use https:",
          });
        } else {
          umamiUrl = parsed.toString();
        }
      } catch {
        issues.push({
          path: ["umamiScriptUrl"],
          message: "Umami script URL must be a valid URL",
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new z.ZodError(
      issues.map((i) => ({ code: "custom" as const, ...i })),
    );
  }

  return {
    gaMeasurementId: gaId,
    umamiSiteId: umamiId,
    umamiScriptUrl: umamiUrl,
  };
}
