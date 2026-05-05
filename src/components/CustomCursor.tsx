import { useEffect, useRef } from 'react';

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -100, y: -100 });
  const targetRef = useRef({ x: -100, y: -100 });
  const scaleRef = useRef(1);
  const targetScaleRef = useRef(1);

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;

    const onMove = (e: MouseEvent) => {
      targetRef.current.x = e.clientX;
      targetRef.current.y = e.clientY;
    };

    const onEnter = () => {
      targetScaleRef.current = 2.5;
    };
    const onLeave = () => {
      targetScaleRef.current = 1;
    };

    let raf: number;
    const loop = () => {
      posRef.current.x += (targetRef.current.x - posRef.current.x) * 0.15;
      posRef.current.y += (targetRef.current.y - posRef.current.y) * 0.15;
      scaleRef.current += (targetScaleRef.current - scaleRef.current) * 0.12;

      dot.style.transform = `translate(${posRef.current.x - 8}px, ${posRef.current.y - 8}px) scale(${scaleRef.current})`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);

    const interactiveEls = document.querySelectorAll('a, button, [data-cursor-hover]');
    interactiveEls.forEach((el) => {
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    });

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      interactiveEls.forEach((el) => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      });
    };
  }, []);

  return (
    <div
      ref={dotRef}
      className="fixed top-0 left-0 w-4 h-4 rounded-full pointer-events-none z-[9999] mix-blend-difference"
      style={{
        background: '#ffffff',
        willChange: 'transform',
      }}
    />
  );
}
