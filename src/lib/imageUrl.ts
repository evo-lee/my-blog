// Shared types for v1 image pipeline.
// `storageKey` is the relative filename inside UPLOAD_DIR (e.g. "abc123-960.webp").
// Public URL is composed at the response/render boundary: PUBLIC_BASE + storageKey.

export type ImageFormat = "avif" | "webp" | "jpeg";

export interface ImageVariant {
  width: number;
  format: ImageFormat;
  storageKey: string;
  bytes?: number;
}

export interface ImageRef {
  hash: string;
  width: number;
  height: number;
  variants: ImageVariant[];
}

const PUBLIC_BASE = "/uploads/img";

export function variantUrl(v: ImageVariant): string {
  return `${PUBLIC_BASE}/${v.storageKey}`;
}

export function srcSet(img: ImageRef, fmt: ImageFormat): string {
  return img.variants
    .filter((v) => v.format === fmt)
    .map((v) => `${variantUrl(v)} ${v.width}w`)
    .join(", ");
}

export function fallbackJpeg(img: ImageRef): string | undefined {
  const jpegs = img.variants.filter((v) => v.format === "jpeg");
  if (jpegs.length === 0) return undefined;
  const pick =
    jpegs.find((v) => v.width === 960) ??
    jpegs.reduce<ImageVariant>((a, b) => (b.width > a.width ? b : a), jpegs[0]!);
  return variantUrl(pick);
}
