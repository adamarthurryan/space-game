import type { Body, BodyClass } from '../sim/body';

/**
 * How a body is drawn (decisions S2-6 and S2-7 in planning/sprint-2.md): one flat colour, and
 * the marker size used when its disc is too small to see.
 */
export interface BodyStyle {
  /** CSS colour. */
  color: string;
  /** Marker diameter, CSS px. */
  markerPx: number;
}

/** Marker diameters (S2-7). */
export const MARKER_PX = { major: 6, minor: 4 } as const;

/** The real system's bodies, by ID. */
const COLORS_BY_ID: Readonly<Record<string, string>> = {
  sun: '#fff4d6',
  mercury: '#9c9389',
  venus: '#e8d3a2',
  earth: '#4f7fc4',
  mars: '#c1643e',
  jupiter: '#d4b08c',
  saturn: '#e3cf9b',
  uranus: '#a6dbe0',
  neptune: '#5b7fde',
  pluto: '#cbb8a2',
  moon: '#b5b2ad',
  io: '#e6d36a',
  europa: '#cdbfa6',
  ganymede: '#a99f92',
  callisto: '#7d7268',
  titan: '#d9a65a',
  triton: '#c9c3c0',
  charon: '#9e9690',
};

/** Fallbacks by class, so a fictional system needs no entries. */
const COLORS_BY_CLASS: Readonly<Record<BodyClass, string>> = {
  star: '#fff4d6',
  planet: '#b0a89c',
  'dwarf-planet': '#bba996',
  moon: '#a8a39c',
};

export function bodyStyle(body: Body): BodyStyle {
  return {
    color: COLORS_BY_ID[body.id] ?? COLORS_BY_CLASS[body.class],
    markerPx: body.major ? MARKER_PX.major : MARKER_PX.minor,
  };
}
