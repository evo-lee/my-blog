import { useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ThumbnailCardProps {
  id: string;
  category: string;
  title: string;
  date: string;
  image: string;
  index: number;
}

export default function ThumbnailCard({ id, category, title, date, image, index }: ThumbnailCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);
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
      delay: index * 0.15,
      scrollTrigger: {
        trigger: cardRef.current,
        start: 'top 85%',
        once: true,
      },
    });

    const tween2 = gsap.to(imgInner, {
      scale: 1,
      duration: 1.4,
      ease: 'expo.inOut',
      delay: index * 0.15,
      scrollTrigger: {
        trigger: cardRef.current,
        start: 'top 85%',
        once: true,
      },
    });

    return () => {
      tween.kill();
      tween2.kill();
    };
  }, [index]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const link = linkRef.current;
    const overlay = overlayRef.current;
    if (!link || !overlay) return;

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
        x: dx * factor * 0.3,
        y: dy * factor * 0.3,
        duration: 0.4,
        ease: 'sine.out',
      });
    }

    gsap.to(overlay, {
      opacity: 0.4,
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
    <div
      ref={cardRef}
      className="group"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        ref={linkRef}
        to={`/article/${id}`}
        className="block will-change-transform"
       
      >
        {/* Image container */}
        <div className="relative overflow-hidden rounded-sm mb-5">
          <div
            ref={imgRef}
            className="relative aspect-[16/10] overflow-hidden"
            style={{ willChange: 'clip-path' }}
          >
            <img
              src={image}
              alt={title}
              className="w-full h-full object-cover will-change-transform transition-transform duration-700 group-hover:scale-105"
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

        {/* Category tag */}
        <span className="block font-mono text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
          {category}
        </span>

        {/* Title */}
        <h3 className="font-display text-xl md:text-2xl leading-snug text-foreground mb-2 tracking-tight group-hover:text-nocturne-gold transition-colors duration-400">
          {title}
        </h3>

        {/* Date */}
        <time className="block font-mono text-xs text-muted-foreground">
          {date}
        </time>
      </Link>
    </div>
  );
}
