// Deterministic 8×8 left-right symmetric pixel avatar.
// Seed = commenter name (lowercased + trimmed). Email is never sent to the
// client (see api/routers/comment.ts listForPost), so it cannot be used.
// Collision risk on common names is acceptable for a personal blog.

import {
  PIXEL_AVATAR_SIZE,
  fnv1a,
  gridFromHash,
  normalizeSeed,
  paletteFromHash,
} from "@/lib/pixelAvatar";

interface Props {
  seed: string;
  size?: number;
  className?: string;
}

export default function PixelAvatar({ seed, size = 32, className }: Props) {
  const hash = fnv1a(normalizeSeed(seed));
  const { fg, bg } = paletteFromHash(hash);
  const grid = gridFromHash(hash);

  const rects = [];
  for (let y = 0; y < PIXEL_AVATAR_SIZE; y++) {
    for (let x = 0; x < PIXEL_AVATAR_SIZE; x++) {
      if (grid[y * PIXEL_AVATAR_SIZE + x]) {
        rects.push(
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fg} />,
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${PIXEL_AVATAR_SIZE} ${PIXEL_AVATAR_SIZE}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
      style={{ backgroundColor: bg, borderRadius: 4 }}
    >
      {rects}
    </svg>
  );
}
