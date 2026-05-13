import { describe, expect, it } from "vitest";
import {
  buildAnalyticsPayloads,
  buildGooglePayload,
  buildUmamiPayload,
} from "./analyticsLoader";

describe("buildGooglePayload", () => {
  it("returns null when the GA id is blank", () => {
    expect(buildGooglePayload("")).toBeNull();
    expect(buildGooglePayload("   ")).toBeNull();
  });

  it("URL-encodes the id and turns page_view off", () => {
    const p = buildGooglePayload("G-ABC1234567");
    expect(p).not.toBeNull();
    expect(p!.provider).toBe("google");
    expect(p!.src).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-ABC1234567",
    );
    expect(p!.inlineBootstrap).toContain("send_page_view");
    expect(p!.sentinelKey).toBe("__gaInit");
    expect(p!.sentinelValue).toBe("G-ABC1234567");
  });
});

describe("buildUmamiPayload", () => {
  it("returns null when either field is blank", () => {
    expect(buildUmamiPayload("", "https://x.example.com/s.js")).toBeNull();
    expect(
      buildUmamiPayload("11111111-2222-3333-4444-555555555555", ""),
    ).toBeNull();
  });

  it("returns a payload with the dataset and sentinel", () => {
    const p = buildUmamiPayload(
      "11111111-2222-3333-4444-555555555555",
      "https://umami.example.com/script.js",
    );
    expect(p).not.toBeNull();
    expect(p!.provider).toBe("umami");
    expect(p!.src).toBe("https://umami.example.com/script.js");
    expect(p!.dataset?.websiteId).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(p!.sentinelKey).toBe("__umamiInit");
    expect(p!.inlineBootstrap).toBeUndefined();
  });
});

describe("buildAnalyticsPayloads — composition", () => {
  it("returns []  when everything is disabled", () => {
    expect(
      buildAnalyticsPayloads({
        gaMeasurementId: "",
        umamiSiteId: "",
        umamiScriptUrl: "",
      }),
    ).toEqual([]);
  });

  it("returns both payloads when both are configured", () => {
    const ps = buildAnalyticsPayloads({
      gaMeasurementId: "G-ABC1234567",
      umamiSiteId: "11111111-2222-3333-4444-555555555555",
      umamiScriptUrl: "https://umami.example.com/script.js",
    });
    expect(ps).toHaveLength(2);
    expect(ps.map((p) => p.provider).sort()).toEqual(["google", "umami"]);
  });
});
