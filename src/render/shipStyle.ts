/**
 * How ships are drawn (decisions S3-18 and S3-20 in planning/sprint-3.md): a colour per ship
 * from an 8-colour palette chosen to differ from the body colours, by `seq % 8`.
 */

/** Vivid colours, unlike the bodies' muted ones. */
export const SHIP_PALETTE = [
  '#3ddc84',
  '#ff4fd8',
  '#00b8ff',
  '#ff8a1f',
  '#b6ff3b',
  '#ff4a5c',
  '#9a6bff',
  '#1de9b6',
] as const;

/** Ship marker size, CSS px (S3-20). */
export const SHIP_MARKER_PX = 7;
/** How much a highlighted ship is lightened towards white (S3-18). */
export const HIGHLIGHT_LIGHTEN = 0.35;

/** The ship's CSS colour. */
export function shipColor(seq: number): string {
  const n = SHIP_PALETTE.length;
  return SHIP_PALETTE[((seq % n) + n) % n]!;
}

/** sRGB components in [0, 1] of a #rrggbb colour. */
export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** The colour lightened by HIGHLIGHT_LIGHTEN towards white, as sRGB components. */
export function highlightRgb(rgb: readonly [number, number, number]): [number, number, number] {
  return [
    rgb[0] + (1 - rgb[0]) * HIGHLIGHT_LIGHTEN,
    rgb[1] + (1 - rgb[1]) * HIGHLIGHT_LIGHTEN,
    rgb[2] + (1 - rgb[2]) * HIGHLIGHT_LIGHTEN,
  ];
}
