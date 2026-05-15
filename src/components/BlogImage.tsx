import { fallbackJpeg, srcSet, type ImageRef } from "@/lib/imageUrl";

interface BlogImageProps {
  img: ImageRef;
  alt: string;
  sizes?: string;
}

export function BlogImage({ img, alt, sizes }: BlogImageProps) {
  const jpeg = fallbackJpeg(img);
  const resolvedSizes = sizes ?? "(max-width: 768px) 100vw, 700px";
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(img, "avif")} sizes={resolvedSizes} />
      <source type="image/webp" srcSet={srcSet(img, "webp")} sizes={resolvedSizes} />
      <img
        src={jpeg}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={img.width}
        height={img.height}
        className="w-full h-auto rounded-sm"
      />
    </picture>
  );
}

export function BrokenImage({ alt }: { alt: string }) {
  return (
    <span className="inline-flex items-center justify-center w-full aspect-video bg-muted text-muted-foreground font-mono text-xs rounded-sm border border-dashed border-border/40">
      [missing image{alt ? `: ${alt}` : ""}]
    </span>
  );
}
