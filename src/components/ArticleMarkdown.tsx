import { Children } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ImageRef } from '@/lib/imageUrl';
import { BlogImage, BrokenImage } from './BlogImage';

interface Props {
  paragraphs: string[];
  images?: Record<string, ImageRef>;
}

const paragraphClass = 'font-body text-base md:text-lg leading-[1.8] text-foreground';

// `hash:<16 hex>` is the canonical v1 image-ref syntax. Anything else falls
// back to a normal <img> so external images and emoji srcs still render.
const HASH_RE = /^hash:([0-9a-f]{16})$/;

function makeImgRenderer(images: Record<string, ImageRef>): Components['img'] {
  return function ImgComp({ src, alt }) {
    const text = alt ?? '';
    const m = typeof src === 'string' ? src.match(HASH_RE) : null;
    if (!m) {
      return <img src={typeof src === 'string' ? src : undefined} alt={text} loading="lazy" />;
    }
    const ref = images[m[1]!];
    if (!ref) return <BrokenImage alt={text} />;
    return <BlogImage img={ref} alt={text} />;
  };
}

// First paragraph gets a drop cap on its first character. The decision is made
// per ReactMarkdown instance — no shared mutable state across the render pass.
function FirstParagraph({ children }: { children?: React.ReactNode }) {
  const arr = Children.toArray(children);
  const first = arr[0];
  if (typeof first === 'string' && first.length > 0) {
    return (
      <p className={paragraphClass}>
        <span className="float-left font-display text-5xl md:text-6xl leading-[0.8] mr-3 mt-1 text-nocturne-gold">
          {first.charAt(0)}
        </span>
        {first.slice(1)}
        {arr.slice(1)}
      </p>
    );
  }
  return <p className={paragraphClass}>{children}</p>;
}

function PlainParagraph({ children }: { children?: React.ReactNode }) {
  return <p className={paragraphClass}>{children}</p>;
}

export function ArticleMarkdown({ paragraphs, images = {} }: Props) {
  if (paragraphs.length === 0) return null;
  const [head, ...rest] = paragraphs;
  const img = makeImgRenderer(images);
  return (
    <>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: FirstParagraph, img }}>
        {head}
      </ReactMarkdown>
      {rest.length > 0 && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: PlainParagraph, img }}>
          {rest.join('\n\n')}
        </ReactMarkdown>
      )}
    </>
  );
}
