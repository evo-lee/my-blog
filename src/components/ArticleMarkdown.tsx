import { Children } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  paragraphs: string[];
}

const paragraphClass = 'font-body text-base md:text-lg leading-[1.8] text-foreground';

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

export function ArticleMarkdown({ paragraphs }: Props) {
  if (paragraphs.length === 0) return null;
  const [head, ...rest] = paragraphs;
  return (
    <>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: FirstParagraph }}>
        {head}
      </ReactMarkdown>
      {rest.length > 0 && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: PlainParagraph }}>
          {rest.join('\n\n')}
        </ReactMarkdown>
      )}
    </>
  );
}
