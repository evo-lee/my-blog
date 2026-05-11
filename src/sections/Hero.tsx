import BlurText from '@/components/BlurText';
import { useSettings } from '@/hooks/useSettings';

export default function Hero() {
  const { heroTitle, heroSubtitle } = useSettings();

  return (
    <section className="pt-28 pb-10 md:pt-32 md:pb-14 flex flex-col items-center justify-center px-6 md:px-10">
      <div className="text-center">
        <BlurText
          key={heroTitle}
          text={heroTitle}
          className="font-display text-3xl md:text-5xl lg:text-6xl text-foreground mb-5 tracking-tight"
          stagger={0.04}
          duration={1}
        />
        <p className="font-body text-sm md:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
          {heroSubtitle}
        </p>
      </div>
    </section>
  );
}
