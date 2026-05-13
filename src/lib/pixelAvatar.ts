// Pure helpers backing src/components/PixelAvatar.tsx. Kept dep-free so they
// can be unit-tested without a DOM.

export const PIXEL_AVATAR_SIZE = 8;
const HALF = PIXEL_AVATAR_SIZE / 2;

export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function normalizeSeed(seed: string): string {
  return seed.trim().toLowerCase() || "anon";
}

export function paletteFromHash(hash: number): { fg: string; bg: string } {
  const hue = hash % 360;
  return {
    fg: `hsl(${hue} 55% 45%)`,
    bg: `hsl(${hue} 30% 92%)`,
  };
}

export function gridFromHash(hash: number): boolean[] {
  let s = hash >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const half: boolean[] = [];
  for (let y = 0; y < PIXEL_AVATAR_SIZE; y++) {
    for (let x = 0; x < HALF; x++) {
      half.push(rand() < 0.5);
    }
  }

  const grid: boolean[] = new Array(PIXEL_AVATAR_SIZE * PIXEL_AVATAR_SIZE);
  for (let y = 0; y < PIXEL_AVATAR_SIZE; y++) {
    for (let x = 0; x < HALF; x++) {
      const v = half[y * HALF + x];
      grid[y * PIXEL_AVATAR_SIZE + x] = v;
      grid[y * PIXEL_AVATAR_SIZE + (PIXEL_AVATAR_SIZE - 1 - x)] = v;
    }
  }
  return grid;
}
