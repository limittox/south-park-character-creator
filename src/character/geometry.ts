import type { BodyGeo } from '../types';

/** Base head size that every head-anchored part is drawn against (head coordinates). */
export const HEAD_RX = 128;
export const HEAD_RY = 110;

/** viewBox used to frame a whole character. Ground sits at y = 480. */
export const CHAR_VIEWBOX = { x: -60, y: -70, w: 520, h: 570 };
export const GROUND_Y = 480;

const kid: BodyGeo = {
  cx: 200,
  headCx: 200,
  headCy: 178,
  headRx: 126,
  headRy: 108,
  torsoTop: 262,
  torsoBottom: 410,
  shoulder: 76,
  hip: 96,
  belly: 0,
  legTop: 396,
  legBottom: 462,
  legSep: 25,
  legW: 46,
  footY: 470,
  footRx: 33,
  footRy: 14,
  footSep: 31,
  shoulderY: 292,
  handX: 104,
  handY: 384,
  handR: 17,
  armW: 30,
  isAdult: false,
};

export const BODY_GEOS: Record<string, BodyGeo> = {
  kid,
  husky: {
    ...kid,
    headRx: 134,
    headRy: 110,
    shoulder: 92,
    hip: 124,
    belly: 16,
    legSep: 33,
    legW: 56,
    footSep: 40,
    footRx: 36,
    handX: 132,
    handY: 382,
    armW: 34,
  },
  skinny: {
    ...kid,
    headRx: 118,
    headRy: 104,
    headCy: 180,
    shoulder: 62,
    hip: 74,
    legSep: 19,
    legW: 34,
    footSep: 24,
    footRx: 28,
    handX: 84,
    handY: 386,
    armW: 24,
  },
  adult: {
    ...kid,
    headCy: 122,
    headRx: 114,
    headRy: 96,
    torsoTop: 196,
    torsoBottom: 384,
    shoulder: 84,
    hip: 94,
    legTop: 370,
    legBottom: 462,
    legSep: 26,
    legW: 46,
    shoulderY: 228,
    handX: 110,
    handY: 352,
    isAdult: true,
  },
  dadbod: {
    ...kid,
    headCy: 122,
    headRx: 118,
    headRy: 98,
    torsoTop: 196,
    torsoBottom: 388,
    shoulder: 96,
    hip: 126,
    belly: 22,
    legTop: 372,
    legBottom: 462,
    legSep: 34,
    legW: 56,
    footSep: 40,
    footRx: 36,
    shoulderY: 228,
    handX: 138,
    handY: 352,
    armW: 34,
    isAdult: true,
  },
  lanky: {
    ...kid,
    headCy: 104,
    headRx: 104,
    headRy: 90,
    torsoTop: 172,
    torsoBottom: 370,
    shoulder: 66,
    hip: 72,
    legTop: 356,
    legBottom: 462,
    legSep: 20,
    legW: 34,
    footSep: 24,
    footRx: 30,
    shoulderY: 204,
    handX: 88,
    handY: 342,
    armW: 24,
    isAdult: true,
  },
};

export interface HeadShape {
  sx: number;
  sy: number;
  path: string;
  canadian?: boolean;
}

const ROUND =
  'M -128 0 C -128 -64 -70 -110 0 -110 C 70 -110 128 -64 128 0 C 128 58 76 110 0 110 C -76 110 -128 58 -128 0 Z';

export const HEAD_SHAPES: Record<string, HeadShape> = {
  round: { sx: 1, sy: 1, path: ROUND },
  wide: { sx: 1.12, sy: 0.96, path: ROUND },
  egg: {
    sx: 0.94,
    sy: 1.08,
    path: 'M -128 10 C -128 -70 -72 -116 0 -116 C 72 -116 128 -70 128 10 C 128 66 74 108 0 108 C -74 108 -128 66 -128 10 Z',
  },
  square: {
    sx: 1.02,
    sy: 0.98,
    path: 'M -128 -40 C -128 -96 -96 -110 -40 -110 L 40 -110 C 96 -110 128 -96 128 -40 L 128 50 C 128 98 96 110 40 110 L -40 110 C -96 110 -128 98 -128 50 Z',
  },
  canadian: {
    sx: 1.04,
    sy: 0.92,
    canadian: true,
    path: 'M -128 6 C -128 -62 -70 -112 0 -112 C 70 -112 128 -62 128 6 C 128 60 74 106 0 106 C -74 106 -128 60 -128 6 Z',
  },
};

/** Where the Canadian head splits when it talks (head coordinates). */
export const CANADIAN_SPLIT_Y = 40;

export function getGeo(body: string, headShape: string): BodyGeo {
  const base = BODY_GEOS[body] ?? BODY_GEOS.kid;
  const shape = HEAD_SHAPES[headShape] ?? HEAD_SHAPES.round;
  return { ...base, headRx: base.headRx * shape.sx, headRy: base.headRy * shape.sy };
}

/** Body outline for shirts and everything worn on the torso. */
export function torsoPath(g: BodyGeo, inset = 0): string {
  const { cx, torsoTop: top, torsoBottom: bot, belly } = g;
  const sh = g.shoulder - inset;
  const hip = g.hip - inset;
  const mid = top + (bot - top) * 0.45;
  return [
    `M ${cx - sh * 0.7} ${top}`,
    `C ${cx - sh} ${top} ${cx - sh} ${top + 10} ${cx - sh} ${top + 26}`,
    `C ${cx - sh - belly} ${mid} ${cx - hip - belly * 0.6} ${bot - 32} ${cx - hip} ${bot - 12}`,
    `Q ${cx - hip} ${bot} ${cx - hip + 14} ${bot}`,
    `Q ${cx} ${bot + 6} ${cx + hip - 14} ${bot}`,
    `Q ${cx + hip} ${bot} ${cx + hip} ${bot - 12}`,
    `C ${cx + hip + belly * 0.6} ${bot - 32} ${cx + sh + belly} ${mid} ${cx + sh} ${top + 26}`,
    `C ${cx + sh} ${top + 10} ${cx + sh} ${top} ${cx + sh * 0.7} ${top}`,
    'Z',
  ].join(' ');
}

/** Horizontal half-width of the torso at a given y (handy for belts, stripes, hems). */
export function torsoHalfWidthAt(g: BodyGeo, y: number): number {
  const t = Math.min(1, Math.max(0, (y - g.torsoTop - 26) / (g.torsoBottom - 12 - g.torsoTop - 26)));
  const bulge = Math.sin(t * Math.PI) * g.belly * 0.9;
  return g.shoulder + (g.hip - g.shoulder) * t + bulge;
}

export type Pt = [number, number];

export interface ArmGeo {
  side: -1 | 1;
  start: Pt;
  ctrl: Pt;
  end: Pt;
}

export function armGeo(g: BodyGeo, side: -1 | 1): ArmGeo {
  const sx = g.cx + side * (g.shoulder - 8);
  const sy = g.shoulderY;
  const ex = g.cx + side * g.handX;
  const ey = g.handY - 8;
  return {
    side,
    start: [sx, sy],
    ctrl: [g.cx + side * (g.shoulder + 10 + g.belly * 0.5), sy + (ey - sy) * 0.55],
    end: [ex, ey],
  };
}

/** Point on a quadratic bezier. */
export function quadAt(a: ArmGeo, t: number): Pt {
  const [x0, y0] = a.start;
  const [x1, y1] = a.ctrl;
  const [x2, y2] = a.end;
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
}

/** The [0, t] piece of the arm curve, as an SVG path. */
export function armPath(a: ArmGeo, t0 = 0, t1 = 1): string {
  // de Casteljau split, twice.
  const split = (p0: Pt, p1: Pt, p2: Pt, t: number): [Pt, Pt, Pt, Pt, Pt] => {
    const l: Pt = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    const r: Pt = [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
    const m: Pt = [l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t];
    return [p0, l, m, r, p2];
  };
  let [p0, p1, p2] = [a.start, a.ctrl, a.end];
  if (t1 < 1) {
    const s = split(p0, p1, p2, t1);
    [p0, p1, p2] = [s[0], s[1], s[2]];
  }
  if (t0 > 0) {
    const s = split(p0, p1, p2, t0 / t1);
    [p0, p1, p2] = [s[2], s[3], s[4]];
  }
  return `M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
}

export function handPos(g: BodyGeo, side: -1 | 1): Pt {
  return [g.cx + side * g.handX, g.handY];
}
