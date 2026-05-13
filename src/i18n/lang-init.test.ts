import { describe, expect, it } from "vitest";
import { resolveInitialLang } from "./lang-init";

describe("resolveInitialLang", () => {
  it("returns the saved value when valid", () => {
    expect(resolveInitialLang("zh", "en-US")).toBe("zh");
    expect(resolveInitialLang("en", "zh-CN")).toBe("en");
  });

  it("falls back to navigator.language when nothing is saved", () => {
    expect(resolveInitialLang(null, "zh-CN")).toBe("zh");
    expect(resolveInitialLang(null, "zh-TW")).toBe("zh");
    expect(resolveInitialLang(null, "en-US")).toBe("en");
    expect(resolveInitialLang(null, "fr-FR")).toBe("en");
  });

  it("ignores unknown saved values and falls through", () => {
    expect(resolveInitialLang("xx", "zh-HK")).toBe("zh");
    expect(resolveInitialLang("", "fr")).toBe("en");
    expect(resolveInitialLang(undefined, undefined)).toBe("en");
  });
});
