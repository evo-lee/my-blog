import { describe, expect, it } from "vitest";
import { normalizeAnalytics } from "./lib/analytics";

describe("normalizeAnalytics — independent toggles", () => {
  it("accepts all-blank (everything disabled)", () => {
    expect(
      normalizeAnalytics({
        gaMeasurementId: "",
        umamiSiteId: "",
        umamiScriptUrl: "",
      }),
    ).toEqual({
      gaMeasurementId: "",
      umamiSiteId: "",
      umamiScriptUrl: "",
    });
  });

  it("accepts a valid GA id by itself", () => {
    expect(
      normalizeAnalytics({
        gaMeasurementId: "G-ABC1234567",
        umamiSiteId: "",
        umamiScriptUrl: "",
      }),
    ).toEqual({
      gaMeasurementId: "G-ABC1234567",
      umamiSiteId: "",
      umamiScriptUrl: "",
    });
  });

  it("accepts both GA and Umami at the same time", () => {
    expect(
      normalizeAnalytics({
        gaMeasurementId: "G-ABC1234567",
        umamiSiteId: "11111111-2222-3333-4444-555555555555",
        umamiScriptUrl: "https://umami.example.com/s.js",
      }),
    ).toEqual({
      gaMeasurementId: "G-ABC1234567",
      umamiSiteId: "11111111-2222-3333-4444-555555555555",
      umamiScriptUrl: "https://umami.example.com/s.js",
    });
  });

  it("rejects a malformed GA id", () => {
    expect(() =>
      normalizeAnalytics({
        gaMeasurementId: "UA-123",
        umamiSiteId: "",
        umamiScriptUrl: "",
      }),
    ).toThrow(/Google Analytics/);
  });

  it("requires both Umami fields together — id without url is invalid", () => {
    expect(() =>
      normalizeAnalytics({
        gaMeasurementId: "",
        umamiSiteId: "11111111-2222-3333-4444-555555555555",
        umamiScriptUrl: "",
      }),
    ).toThrow(/Umami script URL is required/);
  });

  it("requires both Umami fields together — url without id is invalid", () => {
    expect(() =>
      normalizeAnalytics({
        gaMeasurementId: "",
        umamiSiteId: "",
        umamiScriptUrl: "https://umami.example.com/s.js",
      }),
    ).toThrow(/Umami site ID is required/);
  });

  it("rejects Umami with a non-UUID site id", () => {
    expect(() =>
      normalizeAnalytics({
        gaMeasurementId: "",
        umamiSiteId: "not-a-uuid",
        umamiScriptUrl: "https://umami.example.com/s.js",
      }),
    ).toThrow(/UUID/);
  });

  it("rejects Umami with a non-https script URL", () => {
    expect(() =>
      normalizeAnalytics({
        gaMeasurementId: "",
        umamiSiteId: "11111111-2222-3333-4444-555555555555",
        umamiScriptUrl: "http://umami.example.com/s.js",
      }),
    ).toThrow(/https/);
  });

  it("rejects Umami with an unparseable URL", () => {
    expect(() =>
      normalizeAnalytics({
        gaMeasurementId: "",
        umamiSiteId: "11111111-2222-3333-4444-555555555555",
        umamiScriptUrl: "not a url",
      }),
    ).toThrow(/valid URL/);
  });

  it("trims whitespace before validating", () => {
    const out = normalizeAnalytics({
      gaMeasurementId: "  G-ABC1234567  ",
      umamiSiteId: "  ",
      umamiScriptUrl: "  ",
    });
    expect(out.gaMeasurementId).toBe("G-ABC1234567");
    expect(out.umamiSiteId).toBe("");
    expect(out.umamiScriptUrl).toBe("");
  });
});
