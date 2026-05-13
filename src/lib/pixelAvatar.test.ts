import { describe, expect, it } from "vitest";
import {
  PIXEL_AVATAR_SIZE,
  fnv1a,
  gridFromHash,
  normalizeSeed,
  paletteFromHash,
} from "./pixelAvatar";

describe("PixelAvatar helpers", () => {
  it("normalizes seed (trim, lowercase, fallback)", () => {
    expect(normalizeSeed("  Alice  ")).toBe("alice");
    expect(normalizeSeed("")).toBe("anon");
    expect(normalizeSeed("   ")).toBe("anon");
  });

  it("hashes deterministically", () => {
    expect(fnv1a("alice")).toBe(fnv1a("alice"));
    expect(fnv1a("alice")).not.toBe(fnv1a("bob"));
  });

  it("produces a left-right symmetric grid", () => {
    const grid = gridFromHash(fnv1a("alice"));
    expect(grid).toHaveLength(PIXEL_AVATAR_SIZE * PIXEL_AVATAR_SIZE);
    for (let y = 0; y < PIXEL_AVATAR_SIZE; y++) {
      for (let x = 0; x < PIXEL_AVATAR_SIZE; x++) {
        const mirror = PIXEL_AVATAR_SIZE - 1 - x;
        expect(grid[y * PIXEL_AVATAR_SIZE + x]).toBe(
          grid[y * PIXEL_AVATAR_SIZE + mirror],
        );
      }
    }
  });

  it("returns the same grid + palette for the same seed", () => {
    const h = fnv1a(normalizeSeed("Alice"));
    expect(gridFromHash(h)).toEqual(gridFromHash(h));
    expect(paletteFromHash(h)).toEqual(paletteFromHash(h));
  });

  it("returns different grids for different seeds", () => {
    const a = gridFromHash(fnv1a(normalizeSeed("alice")));
    const b = gridFromHash(fnv1a(normalizeSeed("bob")));
    expect(a).not.toEqual(b);
  });
});
