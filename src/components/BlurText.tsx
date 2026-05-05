import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
}

export default function BlurText({
  text,
  className = '',
  delay = 0,
  stagger = 0.03,
  duration = 0.8,
}: BlurTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggered = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || triggered.current) return;

    const spans = el.querySelectorAll('span');
    if (spans.length === 0) return;

    gsap.fromTo(
      spans,
      { opacity: 0, filter: 'blur(12px)' },
      {
        opacity: 1,
        filter: 'blur(0px)',
        duration,
        stagger,
        delay,
        ease: 'power1.out',
        onStart: () => {
          triggered.current = true;
        },
      }
    );

    return () => {
      gsap.killTweensOf(spans);
    };
  }, [delay, stagger, duration]);

  const chars = text.split('');

  return (
    <div ref={containerRef} className={className} aria-label={text}>
      {chars.map((char, i) => (
        <span
          key={i}
          className="inline-block"
          style={{ opacity: 0, willChange: 'filter, opacity' }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </div>
  );
}
