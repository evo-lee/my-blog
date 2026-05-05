import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';

interface WorkCardProps {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  year: string;
  index: number;
}

export default function WorkCard({ id, title, subtitle, category, year, index }: WorkCardProps) {
  return (
    <div className="group">
      <Link
        to={`/works/${id}`}
        className="block"
      >
        {/* Placeholder visual */}
        <div className="relative aspect-[4/3] bg-card rounded-sm mb-5 overflow-hidden border border-border/20">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border border-border/40 flex items-center justify-center">
              <span className="font-display text-2xl text-muted-foreground/40">
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
          </div>
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-nocturne-gold/0 group-hover:bg-nocturne-gold/10 transition-colors duration-500" />
        </div>

        {/* Category + Year */}
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
            {category}
          </span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {year}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-display text-xl md:text-2xl text-foreground leading-snug tracking-tight mb-2 group-hover:text-nocturne-gold transition-colors duration-300 flex items-start gap-2">
          {title}
          <ArrowUpRight className="w-4 h-4 mt-1 opacity-0 group-hover:opacity-100 text-nocturne-gold transition-all duration-300 -translate-x-1 group-hover:translate-x-0" />
        </h3>

        {/* Subtitle */}
        <p className="font-body text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {subtitle}
        </p>
      </Link>
    </div>
  );
}
