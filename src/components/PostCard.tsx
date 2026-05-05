import { useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface PostCardProps {
  category: string;
  title: string;
  date: string;
  excerpt: string;
  image: string;
  index: number;
}

export default function PostCard({ category, title, date, excerpt, image, index }: PostCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Clip-path reveal on scroll
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const imgInner = img.querySelector('img');
    if (!imgInner) return;

    gsap.set(img, { clipPath: 'inset(50% 0% 50% 0%)' });
    gsap.set(imgInner, { scale: 1.2 });

    const tween = gsap.to(img, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 1.4,
      ease: 'expo.inOut',
      scrollTrigger: {
        trigger: cardRef.current,
        start: 'top 80%',
        once: true,
      },
    });

    const tween2 = gsap.to(imgInner, {
      scale: 1,
      duration: 1.4,
      ease: 'expo.inOut',
      scrollTrigger: {
        trigger: cardRef.current,
        start: 'top 80%',
        once: true,
      },
    });

    return () => {
      tween.kill();
      tween2.kill();
    };
  }, [index]);

  // Magnetic hover effect
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const link = linkRef.current;
    const overlay = overlayRef.current;
    const img = imgRef.current;
    if (!link || !overlay || !img) return;

    const rect = link.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;

    const magneticRadius = Math.min(rect.width, rect.height) * 0.3;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < magneticRadius) {
      const factor = 1 - dist / magneticRadius;
      gsap.to(link, {
        x: dx * factor * 0.4,
        y: dy * factor * 0.4,
        skewX: 3 * factor,
        duration: 0.4,
        ease: 'sine.out',
      });
    }

    // Overlay gradient
    gsap.to(overlay, {
      opacity: 0.5,
      duration: 0.4,
      ease: 'sine',
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    const link = linkRef.current;
    const overlay = overlayRef.current;
    if (!link || !overlay) return;

    gsap.to(link, {
      x: 0,
      y: 0,
      skewX: 0,
      duration: 0.5,
      ease: 'sine.out',
    });

    gsap.to(overlay, {
      opacity: 0,
      duration: 0.4,
      ease: 'sine',
    });
  }, []);

  return (
    <article
      ref={cardRef}
      className="group py-16 md:py-24 first:pt-0 last:pb-0"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="max-w-[700px] mx-auto px-6 md:px-10">
        {/* Category tag */}
        <span className="inline-block font-mono text-xs tracking-widest uppercase text-muted-foreground mb-4">
          {category}
        </span>

        {/* Title */}
        <a
          ref={linkRef}
          href="#"
          className="block will-change-transform"
         
        >
          <h2
            ref={titleRef}
            className="font-display text-3xl md:text-[2.8rem] leading-tight text-foreground mb-4 tracking-tight"
          >
            {title}
          </h2>
        </a>

        {/* Date */}
        <time className="block font-mono text-xs text-muted-foreground mb-6">
          {date}
        </time>

        {/* Image with overlay */}
        <div className="relative overflow-hidden rounded-sm mb-6">
          <div
            ref={imgRef}
            className="relative aspect-[16/10] overflow-hidden"
            style={{ willChange: 'clip-path' }}
          >
            <img
              src={image}
              alt={title}
              className="w-full h-full object-cover will-change-transform"
              loading="lazy"
            />
            <div
              ref={overlayRef}
              className="absolute inset-0 opacity-0 pointer-events-none"
              style={{
                background: 'linear-gradient(306deg, rgba(227,175,90,0.5), transparent 64%)',
              }}
            />
          </div>
        </div>

        {/* Excerpt */}
        <p className="font-body text-base md:text-lg leading-relaxed text-muted-foreground max-w-[580px]">
          {excerpt}
        </p>
      </div>
    </article>
  );
}
