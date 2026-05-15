import { describe, expect, it } from "vitest";
import {
  fallbackJpeg,
  srcSet,
  variantUrl,
  type ImageRef,
} from "./imageUrl";

const sample: ImageRef = {
  hash: "abc1234567890def",
  width: 1920,
  height: 1280,
  variants: [
    { width: 480, format: "avif", storageKey: "abc1234567890def-480.avif" },
    { width: 960, format: "avif", storageKey: "abc1234567890def-960.avif" },
    { width: 1920, format: "avif", storageKey: "abc1234567890def-1920.avif" },
    { width: 480, format: "webp", storageKey: "abc1234567890def-480.webp" },
    { width: 960, format: "webp", storageKey: "abc1234567890def-960.webp" },
    { width: 1920, format: "webp", storageKey: "abc1234567890def-1920.webp" },
    { width: 480, format: "jpeg", storageKey: "abc1234567890def-480.jpeg" },
    { width: 960, format: "jpeg", storageKey: "abc1234567890def-960.jpeg" },
    { width: 1920, format: "jpeg", storageKey: "abc1234567890def-1920.jpeg" },
  ],
};

describe("variantUrl", () => {
  it("prefixes storageKey with /uploads/img", () => {
    expect(variantUrl(sample.variants[0]!)).toBe(
      "/uploads/img/abc1234567890def-480.avif",
    );
  });
});

describe("srcSet", () => {
  it("only includes the requested format, ordered as stored", () => {
    expect(srcSet(sample, "avif")).toBe(
      "/uploads/img/abc1234567890def-480.avif 480w, " +
        "/uploads/img/abc1234567890def-960.avif 960w, " +
        "/uploads/img/abc1234567890def-1920.avif 1920w",
    );
  });

  it("returns empty string when no variants match", () => {
    const subset: ImageRef = { ...sample, variants: sample.variants.filter((v) => v.format === "avif") };
    expect(srcSet(subset, "webp")).toBe("");
  });
});

describe("fallbackJpeg", () => {
  it("prefers the 960-wide jpeg when available", () => {
    expect(fallbackJpeg(sample)).toBe("/uploads/img/abc1234567890def-960.jpeg");
  });

  it("falls back to the largest jpeg when 960 is missing", () => {
    const small: ImageRef = {
      ...sample,
      variants: [
        { width: 480, format: "jpeg", storageKey: "x-480.jpeg" },
        { width: 800, format: "jpeg", storageKey: "x-800.jpeg" },
      ],
    };
    expect(fallbackJpeg(small)).toBe("/uploads/img/x-800.jpeg");
  });

  it("returns undefined when no jpeg variants exist", () => {
    const noJpeg: ImageRef = {
      ...sample,
      variants: sample.variants.filter((v) => v.format !== "jpeg"),
    };
    expect(fallbackJpeg(noJpeg)).toBeUndefined();
  });
});
