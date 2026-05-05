import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useI18n } from '@/i18n/useI18n';
import { SEO, PersonJSONLD } from '@/components/SEO';

export default function About() {
  const pageRef = useRef<HTMLDivElement>(null);
  const { lang } = useI18n();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (pageRef.current) {
      gsap.fromTo(
        pageRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }
      );
    }
  }, []);

  const title = lang === 'zh' ? '关于' : 'About';
  const greeting = lang === 'zh' ? '你好，我是 Evo Lee。' : 'Hello, I am Evo Lee.';
  const description = lang === 'zh'
    ? '关于文学、设计与沉思的个人博客。'
    : 'A personal blog about literature, design, and quiet contemplation.';

  return (
    <>
      <SEO
        title={title}
        description={description}
        keywords="Evo Lee, blog, about, writer, designer"
        url="/about"
      />
      <PersonJSONLD />
      <div ref={pageRef} className="min-h-screen pt-28 pb-24 md:pb-32">
      <div className="max-w-[700px] mx-auto px-6 md:px-10">
        <h1 className="font-display text-4xl md:text-6xl text-foreground mb-12 tracking-tight">
          {title}
        </h1>

        <div className="space-y-8">
          <p className="font-body text-base md:text-lg leading-[1.8] text-foreground">
            <span className="float-left font-display text-5xl md:text-6xl leading-[0.8] mr-3 mt-1 text-nocturne-gold">
              {greeting.charAt(0)}
            </span>
            {greeting.slice(1)}
          </p>

          <p className="font-body text-base md:text-lg leading-[1.8] text-foreground">
            {lang === 'zh'
              ? '这是一个关于文学、设计与沉思的个人博客。我在这里记录阅读时的触动、创作时的困惑，以及生活中那些安静而不被言说的角落。'
              : 'This is a personal blog about literature, design, and quiet contemplation. Here I record the moments that move me while reading, the confusions I face while creating, and the silent corners of life that go unspoken.'}
          </p>

          <p className="font-body text-base md:text-lg leading-[1.8] text-foreground">
            {lang === 'zh'
              ? '我相信写作是思考的延伸，而留白是设计的一部分。这里的每一篇文章都经过反复斟酌，每一个页面都追求极致的简洁。'
              : 'I believe writing is the extension of thinking, and whitespace is part of design. Every article here has been carefully considered, and every page pursues ultimate simplicity.'}
          </p>

          <p className="font-body text-base md:text-lg leading-[1.8] text-foreground">
            {lang === 'zh'
              ? '如果你对我的文字感兴趣，欢迎订阅 RSS，或通过邮件与我交流。'
              : 'If you are interested in my writing, feel free to subscribe via RSS or reach out by email.'}
          </p>
        </div>

        <div className="border-t border-border/30 mt-16 pt-12">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <a
              href="mailto:hello@example.com"
              className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              hello@example.com
            </a>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-muted-foreground/40" />
            <a
              href="/feed.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors duration-300 flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/>
                <circle cx="5" cy="19" r="1"/>
              </svg>
              RSS Feed
            </a>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
