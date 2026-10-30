import { hexToRgb, rgbToHex, rgbToLab, type RGB } from './color';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../data/palette';
import type { Img, Traits } from './photoAnalysis';

/**
 * Turns the scanner's output (face landmarks, expression scores and per-pixel labels) into
 * character traits. Everything here is plain maths on arrays so it can be unit-tested.
 *
 * Measurements use "face units": the face is about 1 wide (cheek to cheek) and 1 tall (top of
 * the forehead to the chin), centred on 0, with y pointing down the face. Head tilt is removed.
 */

/** Segmenter labels, in the model's own order. */
export const SEG = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, other: 5 } as const;

export interface Pt {
  x: number;
  y: number;
}

/** A cut-out of the picture around one head, with a segmenter label for every pixel. */
export interface Segment {
  img: Img;
  labels: Uint8Array;
  /** Where the cut-out sits in the scanned image, and how much it was scaled. */
  x: number;
  y: number;
  scale: number;
}

/* ------------------------------------------------------------ landmarks */

export const LM = { top: 10, chin: 152, left: 234, right: 454, noseBottom: 2, lipTop: 0, lipBottom: 17, mouthL: 61, mouthR: 291, irisL: 468, irisR: 473 };
export const EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const EYE_R = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

export interface Frame {
  c: Pt;
  u: Pt;
  v: Pt;
  w: number;
  h: number;
}

/** The face's own coordinate system (see the note at the top). */
export function faceFrame(p: Pt[]): Frame {
  const top = p[LM.top];
  const chin = p[LM.chin];
  const c = { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2 };
  const h = Math.hypot(chin.x - top.x, chin.y - top.y) || 1;
  const v = { x: (chin.x - top.x) / h, y: (chin.y - top.y) / h };
  const u = { x: v.y, y: -v.x };
  const w = Math.abs((p[LM.right].x - p[LM.left].x) * u.x + (p[LM.right].y - p[LM.left].y) * u.y) || h * 0.8;
  return { c, u, v, w, h };
}

export function toFace(f: Frame, x: number, y: number): [number, number] {
  const dx = x - f.c.x;
  const dy = y - f.c.y;
  return [(dx * f.u.x + dy * f.u.y) / f.w, (dx * f.v.x + dy * f.v.y) / f.h];
}

function inPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------ colour helpers */

const lumOf = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const toLin = (v: number) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const toSrgb = (v: number) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** Average colour in linear light, after dropping the darkest and brightest pixels. */
export function trimmedMean(px: RGB[], lo = 0.2, hi = 0.85): RGB | null {
  if (!px.length) return null;
  const sorted = [...px].sort((a, b) => lumOf(...a) - lumOf(...b));
  const part = sorted.slice(Math.floor(sorted.length * lo), Math.max(Math.floor(sorted.length * lo) + 1, Math.ceil(sorted.length * hi)));
  const s = [0, 0, 0];
  for (const p of part) for (let k = 0; k < 3; k++) s[k] += toLin(p[k]);
  return s.map((v) => toSrgb(v / part.length)) as RGB;
}

/**
 * Lighting correction. The whites of the eyes are close to neutral, so their tint tells us the
 * colour of the light; a picture shot under warm bulbs gets cooled down and vice versa. Brightness
 * is left alone: eye whites are too often in shadow to say how bright the picture should be.
 */
export function lightFix(sclera: RGB | null): (c: RGB) => RGB {
  if (!sclera) return (c) => c;
  const lin = sclera.map(toLin);
  const avg = (lin[0] + lin[1] + lin[2]) / 3;
  if (avg < 0.08) return (c) => c;
  const gain = lin.map((v) => Math.max(0.9, Math.min(1.1, avg / Math.max(v, 1e-4))));
  return (c) => c.map((v, k) => Math.min(255, toSrgb(Math.min(1, toLin(v) * gain[k])))) as RGB;
}

const labDist = (a: [number, number, number], b: [number, number, number], wL = 1) => Math.hypot((a[0] - b[0]) * wL, a[1] - b[1], a[2] - b[2]);

/**
 * Skin tone by Individual Typology Angle, the dermatologists' measure: atan((L* - 50) / b*).
 * It weighs lightness against yellowness, which holds up across exposures far better than
 * lightness alone. These are where each of the ten natural paper tones starts, lightest first,
 * calibrated on studio portraits across the whole range.
 */
const ITA_STEPS = [70, 48, 40, 32, 24, 16, 6, -12, -30];

export function skinAngle(c: RGB): number {
  const [L, , b] = rgbToLab(c);
  // Under cool light b* can drop close to zero, which would swing the angle wildly for darker skin.
  return (Math.atan2(L - 50, Math.max(L < 50 ? 18 : 6, b)) * 180) / Math.PI;
}

export function skinSwatch(c: RGB): string {
  const ita = skinAngle(c);
  const k = ITA_STEPS.findIndex((t) => ita >= t);
  return SKIN_TONES[k < 0 ? 9 : k].color;
}

const HAIR = Object.fromEntries(HAIR_COLORS.map((s) => [s.name, s.color]));

/**
 * Names the hair colour. Studio light and coloured backdrops wash the colour out of hair, so
 * greyness is judged against the skin in the same picture: grey hair has much less colour than
 * the face below it, brown hair keeps a fair share of it.
 */
export function hairSwatch(c: RGB, skin?: RGB): string {
  const [L, a, b] = rgbToLab(c);
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  const skinChroma = skin ? Math.hypot(...rgbToLab(skin).slice(1) as [number, number]) : 20;
  const rel = chroma / Math.max(10, skinChroma);
  // Browns, blondes and gingers sit between red and yellow; anything colourful outside that is dye.
  if (chroma > 30 && !(hue > 25 && hue < 95)) {
    let best = HAIR_COLORS[10].color;
    let bestD = Infinity;
    for (const s of HAIR_COLORS.slice(10)) {
      const d = labDist([L, a, b], rgbToLab(hexToRgb(s.color)), 0.6);
      if (d < bestD) {
        bestD = d;
        best = s.color;
      }
    }
    return best;
  }
  if (L < 32 && chroma >= 14 && hue < 50) return HAIR.Auburn;
  if (L < 20) return chroma >= 14 ? HAIR['Dark Brown'] : HAIR['Jet Black'];
  // Natural hair is never blue: a bluish cast on light hair is grey or white hair lit by the backdrop.
  if (L >= 35 && b < 2) return L >= 78 ? HAIR.White : HAIR.Gray;
  // Red hair is far more colourful than brown hair of the same hue.
  if (chroma > 30 && hue < 65) return L > 45 ? HAIR.Ginger : HAIR.Auburn;
  if ((L >= 40 && rel < 0.32) || (L >= 33 && rel < 0.22)) return L >= 78 ? HAIR.White : HAIR.Gray;
  if (L >= 55 && b > 15) return chroma < 18 && L >= 70 ? HAIR.Platinum : HAIR.Blonde;
  if (L >= 70) return rel < 0.45 ? HAIR.White : HAIR.Platinum;
  if (L >= 45) return HAIR['Light Brown'];
  if (L >= 30) return HAIR.Brown;
  return HAIR['Dark Brown'];
}

function nearestCloth(c: RGB): string {
  const lab = rgbToLab(c);
  let best = CLOTH_COLORS[0];
  let bestD = Infinity;
  for (const o of CLOTH_COLORS) {
    const d = labDist(lab, rgbToLab(hexToRgb(o)), 0.8);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** The biggest colour group in a set of pixels (a tiny k-means), so logos and folds don't muddy a shirt. */
export function dominant(px: RGB[], k = 3): RGB | null {
  if (px.length < 12) return null;
  const labs = px.map((p) => rgbToLab(p));
  const sorted = labs.map((l, i) => [l[0], i] as const).sort((a, b) => a[0] - b[0]);
  let centers = Array.from({ length: k }, (_, j) => labs[sorted[Math.floor(((j + 0.5) / k) * sorted.length)][1]].slice() as number[]);
  let assign = new Int32Array(labs.length);
  for (let it = 0; it < 8; it++) {
    assign = new Int32Array(labs.length);
    labs.forEach((l, i) => {
      let bd = Infinity;
      centers.forEach((c, j) => {
        const d = (l[0] - c[0]) ** 2 + (l[1] - c[1]) ** 2 + (l[2] - c[2]) ** 2;
        if (d < bd) {
          bd = d;
          assign[i] = j;
        }
      });
    });
    centers = centers.map((c, j) => {
      const members = labs.filter((_, i) => assign[i] === j);
      if (!members.length) return c;
      return [0, 1, 2].map((q) => members.reduce((s, m) => s + m[q], 0) / members.length);
    });
  }
  const counts = centers.map((_, j) => assign.filter((a) => a === j).length);
  const big = counts.indexOf(Math.max(...counts));
  const members = px.filter((_, i) => assign[i] === big);
  return trimmedMean(members, 0.1, 0.9);
}

/* ------------------------------------------------------------ hair shape */

/** Hair measurements in face units, from the segmenter's hair label. */
export interface HairMetrics {
  /** Share of the crown (just above the forehead) covered by hair. */
  crown: number;
  /** How far the hair reaches out from the middle of the face (the cheeks are at 0.5). */
  width: number;
  /** Lowest point the hair reaches beside the face (0.5 is the chin). */
  length: number;
  /** Hair right beside the cheeks, which pulled-back styles (ponytails, braids) leave bare. */
  cheeks: number;
  /** Fringe over the forehead, overall and per side. */
  bangs: number;
  bangsLeft: number;
  bangsRight: number;
  /** Fringe hanging down over one eye. */
  eyeCover: number;
  /** Hair round the sides above the ears (what a horseshoe keeps). */
  sides: number;
  /** Lightness of the hair (CIE L*): the segmenter catches less of grey and blond hair, so it reads thinner. */
  lightness: number;
  /** Hair at the temples, which a mohawk shaves off. */
  temples: number;
  /** Hair in a narrow strip along the top of the head. */
  strip: number;
  /** Separate strands hanging below the chin on both sides with a gap between them. */
  strands: boolean;
  /** Hair thickness on top: from the hairline (or fringe) up to the top of the hair. */
  thickness: number;
  /** Something that isn't hair or skin sitting on top of the head. */
  hat: number;
}

export type HairLengthName = 'bald' | 'short' | 'medium' | 'long';

export function hairLengthName(m: HairMetrics): HairLengthName {
  if (m.crown < 0.18 && m.length < 0.1 && m.hat < 0.4) return 'bald';
  if (m.length > 0.7) return 'long';
  if (m.length > 0.28) return 'medium';
  return 'short';
}

/**
 * Picks the closest hairstyle in the catalog from the hair's shape. Thresholds were tuned on
 * studio portraits: short hair is 0.1-0.3 thick on top, big hair 0.45 and up; the face is 1 wide.
 */
export function classifyHair(m: HairMetrics): { id: string; why: string } {
  const len = hairLengthName(m);
  const big = m.thickness >= 0.45 && m.width >= 1.05;
  if (len === 'bald') {
    return m.sides > 0.25 ? { id: 'horseshoe', why: 'bald on top, hair round the sides' } : { id: 'bald', why: 'no hair on top' };
  }
  if (m.hat < 0.4 && m.thickness >= 0.55 && m.width >= 1 && len !== 'long') return { id: 'afro', why: 'big and round' };
  if (len === 'long') {
    if (m.strands && m.cheeks < 0.3) return { id: 'pigtails', why: 'long, in two bunches' };
    if (big) return { id: 'wavy', why: 'long and full' };
    return { id: 'long', why: 'past the shoulders' };
  }
  if (m.eyeCover > 0.3) return { id: 'emo', why: 'fringe over one eye' };
  if (len === 'medium') {
    if (big && m.width >= 1.15) return { id: 'curly', why: 'chin length and full' };
    return { id: 'bob', why: 'down to the chin' };
  }
  // Short hair.
  if (m.hat < 0.4 && m.strip > 0.5 && m.temples < 0.2 && m.thickness > 0.12) return { id: 'mohawk', why: 'a strip down the middle' };
  if (m.bangs > 0.6 && Math.abs(m.bangsLeft - m.bangsRight) < 0.25) return { id: 'bowl', why: 'a straight fringe all the way across' };
  if (m.thickness >= 0.42) return m.bangs < 0.35 ? { id: 'curly', why: 'short with lots of volume' } : { id: 'messy', why: 'short and full, fringe down' };
  if (m.thickness < (m.lightness > 40 ? 0.09 : 0.15)) return { id: 'buzz', why: 'cropped close' };
  if (m.thickness < 0.26) return { id: 'sidepart', why: 'short and neat' };
  return { id: 'messy', why: 'short with some volume' };
}

/* ------------------------------------------------------------ other features */

export interface FacialHairZones {
  /** Grain of the upper lip, chin and jaw next to the cheeks (1 = as smooth as the cheeks). */
  lip: number;
  chin: number;
  jaw: number;
  /** Brightness of the upper lip next to the cheeks (a dark moustache is well under 1). */
  lipLight: number;
}

/** Grain above this (relative to the cheeks) means whiskers. Clean-shaven faces stay under ~1.9. */
const WHISKERS = 2.2;

export function classifyFacialHair(z: FacialHairZones): { id: string; why: string } {
  const lipColour = (z.lipLight < 0.5 && z.lip > 1.6) || z.lipLight > 1.3;
  const lip = z.lip > WHISKERS || lipColour;
  const chin = z.chin > WHISKERS;
  const jaw = z.jaw > WHISKERS;
  if (jaw && chin) return lip ? { id: 'beard', why: 'jaw, chin and lip' } : { id: 'chinstrap', why: 'along the jaw, no moustache' };
  if (chin && lip) return { id: 'goatee', why: 'chin and lip only' };
  // A dimple or shadow under the lip can look grainy, so a patch on its own has to be clear.
  if (z.chin > WHISKERS * 1.25) return { id: 'soulpatch', why: 'a patch on the chin' };
  // On its own a moustache has to stand out more: a shaved upper lip can be a little shadowy.
  if (z.lip > WHISKERS * 1.25 || lipColour) return { id: 'mustache', why: 'upper lip' };
  if (Math.max(z.chin, z.jaw) > 2.3 && Math.min(z.chin, z.jaw) > 1.9) return { id: 'stubble', why: 'a five o’clock shadow' };
  return { id: 'none', why: 'clean shaven' };
}

export interface GlassesClues {
  /** Strongest straight edge below the eyes, across the nose bridge and at the temples, against plain cheek. */
  rims: number;
  bridge: number;
  temples: number;
  /** How dark the eye area is next to the cheeks (sunglasses). */
  eyeDark: number;
  /** Share of a ring round the eyes that the segmenter calls an accessory (it labels most frames). */
  accessory: number;
}

export function classifyGlasses(g: GlassesClues): { id: string; why: string } {
  // A bare nose bridge is smooth (under 1 on studio portraits); a frame across it scores 2.5 or more.
  const score = g.bridge * 0.6 + g.temples * 0.4 + g.accessory * 2;
  if (g.eyeDark > 0.78 && (g.accessory > 0.3 || score > 1.2)) return { id: 'sunglasses', why: 'dark lenses' };
  if (score > 1.4) return { id: g.bridge > 2.4 ? 'square' : 'round', why: g.bridge > 2.4 ? 'bold frames' : 'thin frames' };
  return { id: 'none', why: 'no frames found' };
}

/** Maps the landmarker's expression scores (and visible teeth) onto the catalog's faces. */
export function expressionFrom(b: Record<string, number>, teeth: number): { mouth: string; eyes: string; brows: string | null; why: string } {
  const s = (k: string) => b[k] ?? 0;
  const smile = (s('mouthSmileLeft') + s('mouthSmileRight')) / 2;
  const lopsided = Math.abs(s('mouthSmileLeft') - s('mouthSmileRight'));
  const open = s('jawOpen');
  const frown = (s('mouthFrownLeft') + s('mouthFrownRight')) / 2;
  const blinkL = s('eyeBlinkLeft');
  const blinkR = s('eyeBlinkRight');
  const wide = (s('eyeWideLeft') + s('eyeWideRight')) / 2;
  const browDown = (s('browDownLeft') + s('browDownRight')) / 2;
  const browUp = s('browInnerUp');
  const outerUp = (s('browOuterUpLeft') + s('browOuterUpRight')) / 2;

  let mouth = 'flat';
  let why = 'straight face';
  if (s('tongueOut') > 0.4) [mouth, why] = ['tongue', 'tongue out'];
  else if (s('mouthPucker') > 0.6 && smile < 0.3) [mouth, why] = ['kissy', 'puckered up'];
  else if (open > 0.4 && smile < 0.35) [mouth, why] = s('mouthFunnel') > 0.25 ? ['oshock', 'mouth in an O'] : ['shout', 'mouth wide open'];
  else if (smile > 0.35) {
    if (lopsided > 0.3 && teeth < 0.08) [mouth, why] = ['smug', 'a lopsided smirk'];
    else if (teeth > 0.08 || open > 0.12) [mouth, why] = ['grin', 'big toothy smile'];
    else [mouth, why] = ['smile', 'closed-mouth smile'];
  } else if (frown > 0.3) [mouth, why] = ['frown', 'frowning'];
  else if (smile > 0.12) [mouth, why] = ['smile', 'slight smile'];
  else if (teeth > 0.15) [mouth, why] = ['grimace', 'teeth showing'];

  let eyes = 'classic';
  if (Math.abs(blinkL - blinkR) > 0.45 && Math.max(blinkL, blinkR) > 0.6) eyes = 'wink';
  else if (blinkL > 0.55 && blinkR > 0.55) eyes = smile > 0.45 ? 'happy' : 'sleepy';
  else if (wide > 0.35 || (open > 0.4 && browUp > 0.4)) eyes = 'wide';
  else if ((blinkL + blinkR) / 2 > 0.4) eyes = 'half';

  let brows: string | null = null;
  if (browDown > 0.45 && smile < 0.25) brows = 'angry';
  else if (browUp > 0.5 && frown > 0.2) brows = 'sad';
  else if (browUp > 0.55) brows = 'worried';
  else if (outerUp > 0.5) brows = 'raised';
  return { mouth, eyes, brows, why };
}

/* ------------------------------------------------------------ the full read */

export interface Reading {
  traits: Traits;
  /** The colours as measured (after the lighting fix), before matching to the paper palette. */
  measured: { skin: string; hair: string | null; shirt: string | null };
  why: Partial<Record<keyof Traits, string>>;
  debug: { hair: HairMetrics; facialHair: FacialHairZones; glasses: GlassesClues; teeth: number; lab: Record<string, number[] | null> };
}

const G = 0.05;
const GX0 = -2;
const GY0 = -1.6;
const GW = 80;
const GH = 80;

/** Reads one face. `p` are the landmarks in the segment's pixels; `blend` the expression scores. */
export function readFace(seg: Segment, p: Pt[], blend: Record<string, number>): Reading {
  const { img, labels } = seg;
  const { width: W, height: H, data } = img;
  const f = faceFrame(p);
  const fy = (i: number) => toFace(f, p[i].x, p[i].y)[1];
  const fx = (i: number) => toFace(f, p[i].x, p[i].y)[0];
  const eyePts = [...EYE_L, ...EYE_R];
  const eyeTop = Math.min(...eyePts.map(fy));
  const eyeBottom = Math.max(...eyePts.map(fy));
  const eyeMid = (eyeTop + eyeBottom) / 2;
  const browFy = (fy(105) + fy(334)) / 2;
  const noseFy = fy(LM.noseBottom);
  const lipTopFy = fy(LM.lipTop);
  const lipBotFy = fy(LM.lipBottom);
  const mouthFy = (fy(LM.mouthL) + fy(LM.mouthR)) / 2;
  const chinFy = fy(LM.chin);
  const eyeSpan = [Math.min(...EYE_L.map(fx)), Math.max(...EYE_L.map(fx)), Math.min(...EYE_R.map(fx)), Math.max(...EYE_R.map(fx))];
  const eyeInner = Math.min(Math.abs(eyeSpan[1]), Math.abs(eyeSpan[2]));

  // Pass 1: label grid in face units, plus colour samples.
  const grid = new Uint32Array(GW * GH * 6);
  const gridTotal = new Uint32Array(GW * GH);
  const lum = new Float32Array(W * H);
  const faceX = new Float32Array(W * H);
  const faceY = new Float32Array(W * H);
  const skinPx: RGB[] = [];
  const hairPx: RGB[] = [];
  const shirtPx: RGB[] = [];
  const hatPx: RGB[] = [];
  const hairlineYs: number[] = [];
  const COLS = 160;
  const colTop = new Float32Array(COLS).fill(9);
  const isHair = (i: number) => i >= 0 && i < labels.length && labels[i] === SEG.hair;
  const step = Math.max(1, Math.round(Math.sqrt((W * H) / 90000)));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      lum[i] = lumOf(r, g, b);
      const [u, v] = toFace(f, x, y);
      faceX[i] = u;
      faceY[i] = v;
      const gx = Math.floor((u - GX0) / G);
      const gy = Math.floor((v - GY0) / G);
      const lab = labels[i];
      if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) {
        grid[(gy * GW + gx) * 6 + lab]++;
        gridTotal[gy * GW + gx]++;
      }
      const au = Math.abs(u);
      if (lab === SEG.hair) {
        const c = Math.floor((u + 1.6) / 0.02);
        if (c >= 0 && c < COLS && v < colTop[c]) colTop[c] = v;
        if (au < 0.15 && v < browFy - 0.02 && v > -1.2) hairlineYs.push(v);
      }
      if ((x % step) || (y % step)) continue;
      if (lab === SEG.faceSkin) {
        const cheek = au > 0.12 && au < 0.34 && v > eyeBottom + 0.05 && v < mouthFy - 0.03;
        const forehead = au < 0.2 && v > -0.45 && v < browFy - 0.05;
        if (cheek || forehead) skinPx.push([r, g, b]);
      } else if (lab === SEG.hair && v < Math.min(0.1, eyeMid) && isHair(i - 3) && isHair(i + 3) && isHair(i - 3 * W) && isHair(i + 3 * W)) hairPx.push([r, g, b]);
      else if (lab === SEG.clothes && v > chinFy + 0.15 && au < 1.3) shirtPx.push([r, g, b]);
      if ((lab === SEG.clothes || lab === SEG.other) && au < 0.4 && v < -0.55 && v > -1.1) hatPx.push([r, g, b]);
    }
  }
  const frac = (label: number, x0: number, x1: number, y0: number, y1: number) => {
    let n = 0;
    let t = 0;
    for (let gy = Math.max(0, Math.floor((y0 - GY0) / G)); gy < Math.min(GH, Math.ceil((y1 - GY0) / G)); gy++) {
      for (let gx = Math.max(0, Math.floor((x0 - GX0) / G)); gx < Math.min(GW, Math.ceil((x1 - GX0) / G)); gx++) {
        n += grid[(gy * GW + gx) * 6 + label];
        t += gridTotal[gy * GW + gx];
      }
    }
    return t ? n / t : 0;
  };
  const hair = (x0: number, x1: number, y0: number, y1: number) => frac(SEG.hair, x0, x1, y0, y1);
  const sides = (x0: number, x1: number, y0: number, y1: number) => Math.max(hair(-x1, -x0, y0, y1), hair(x0, x1, y0, y1));

  // Hair shape.
  let width = 0;
  for (let y = -0.75; y < -0.05; y += G) {
    for (const side of [-1, 1]) {
      let reach = 0;
      for (let x = 0.4; x < 1.9; x += G) {
        const a = side < 0 ? -x - G : x;
        if (hair(a, a + G, y, y + G) > 0.3) reach = x + G;
        else if (x > 0.55) break;
      }
      width = Math.max(width, reach);
    }
  }
  let length = -0.5;
  let gap = 0;
  for (let y = -0.4; y < 2.3; y += G) {
    const x0 = y < 0.2 ? 0.48 : 0.42;
    if (sides(x0, 1.3, y, y + G) > 0.12) {
      length = y + G;
      gap = 0;
    } else if (++gap > 2 && y > 0) break;
  }
  const eyeCover = Math.max(hair(eyeSpan[0], eyeSpan[1], eyeTop - 0.03, eyeBottom), hair(eyeSpan[2], eyeSpan[3], eyeTop - 0.03, eyeBottom));
  const bangsLeft = hair(-0.3, 0, -0.5, browFy - 0.04);
  const bangsRight = hair(0, 0.3, -0.5, browFy - 0.04);
  const low = chinFy + 0.3;
  const strands = hair(-1.2, -0.3, low, low + 0.4) > 0.15 && hair(0.3, 1.2, low, low + 0.4) > 0.15 && hair(-0.12, 0.12, low, low + 0.4) < 0.05;
  const hatShare = hatPx.length ? frac(SEG.clothes, -0.4, 0.4, -1.0, -0.6) + frac(SEG.other, -0.4, 0.4, -1.0, -0.6) : 0;

  // Thickness on top: from the hairline (or the fringe) up to the highest hair above the middle of the face.
  const center = [...colTop.slice(Math.floor(1.45 / 0.02), Math.ceil(1.75 / 0.02))].filter((t) => t < 9);
  const hairTop = center.length ? Math.min(...center) : -0.5;
  hairlineYs.sort((a, b) => a - b);
  const hairline = hairlineYs.length > 20 ? hairlineYs[Math.floor(hairlineYs.length * 0.9)] : hairTop;

  // Running sums of brightness, for quick local averages (used to find whisker grain below).
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += lum[y * W + x];
      S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row;
    }
  }
  const box = (x: number, y: number, r: number) => {
    const x0 = Math.max(0, x - r);
    const y0 = Math.max(0, y - r);
    const x1 = Math.min(W, x + r + 1);
    const y1 = Math.min(H, y + r + 1);
    return (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  };
  const hairM: HairMetrics = {
    crown: hair(-0.3, 0.3, -0.8, -0.55),
    width,
    length,
    cheeks: sides(0.5, 0.85, -0.1, 0.3),
    bangs: (bangsLeft + bangsRight) / 2,
    bangsLeft,
    bangsRight,
    eyeCover,
    sides: sides(0.42, 0.75, -0.45, 0.05),
    lightness: 0,
    temples: (hair(-0.52, -0.32, -0.75, -0.5) + hair(0.32, 0.52, -0.75, -0.5)) / 2,
    strip: hair(-0.1, 0.1, -0.95, -0.6),
    strands,
    thickness: Math.max(0, hairline - hairTop),
    hat: hatShare,
  };

  // Colours, corrected for the light using the whites of the eyes.
  const scleraPx: RGB[] = [];
  for (const [poly, iris] of [[EYE_L, LM.irisL], [EYE_R, LM.irisR]] as const) {
    const pts = poly.map((i) => p[i]);
    const ic = p[iris];
    const ir = p[iris + 1] ? Math.max(1, ([1, 2, 3, 4].reduce((s, k) => s + Math.hypot(p[iris + k].x - ic.x, p[iris + k].y - ic.y), 0) / 4) * 1.15) : 0;
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const cand: { c: RGB; l: number }[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
        if (!inPoly(pts, x, y) || Math.hypot(x - ic.x, y - ic.y) < ir) continue;
        const i = y * W + x;
        cand.push({ c: [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], l: lum[i] });
      }
    }
    cand.sort((a, b) => b.l - a.l);
    scleraPx.push(...cand.slice(0, Math.ceil(cand.length * 0.35)).map((q) => q.c));
  }
  const skinRaw = trimmedMean(skinPx, 0.25, 0.85);
  const scleraRaw = scleraPx.length >= 10 ? trimmedMean(scleraPx, 0.2, 0.9) : null;
  // Eye whites much darker than the skin are in deep shadow (or behind sunglasses): no use as a reference.
  const fix = lightFix(scleraRaw && skinRaw && lumOf(...scleraRaw) > lumOf(...skinRaw) * 0.85 ? scleraRaw : null);
  const skinRgb = fix(skinRaw ?? [232, 190, 160]);
  const hairRaw = trimmedMean(hairPx, 0.3, 0.8);
  const hairRgb = hairRaw ? fix(hairRaw) : null;
  hairM.lightness = hairRgb ? rgbToLab(hairRgb)[0] : 0;
  const shirtRaw = dominant(shirtPx);
  const shirtRgb = shirtRaw ? fix(shirtRaw) : null;
  const hatRgb = hatPx.length > 30 ? dominant(hatPx) : null;
  const refL = skinRaw ? lumOf(...skinRaw) : 0.6;
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

  // Pass 2: zones for facial hair, glasses and teeth.
  // The segmenter calls beards "face", so whiskers are found by their grain: next to smooth cheek
  // skin, a beard or moustache is full of fine light/dark speckle. Medians keep glasses frames
  // and stray hairs from skewing a zone.
  const rf = Math.max(1, Math.round(f.w * 0.008));
  const zone = () => ({ grain: [] as number[], sum: 0, n: 0, other: 0 });
  const Z = { lip: zone(), chin: zone(), jaw: zone(), cheek: zone(), eyes: zone() };
  const rows = { rimL: new Map<number, [number, number]>(), rimR: new Map<number, [number, number]>(), bridge: new Map<number, [number, number]>(), temple: new Map<number, [number, number]>(), cheek: new Map<number, [number, number]>() };
  const addRow = (m: Map<number, [number, number]>, y: number, g: number) => {
    const e = m.get(y) ?? [0, 0];
    e[0] += g;
    e[1]++;
    m.set(y, e);
  };
  const lips = LIPS_INNER.map((i) => p[i]);
  const eyePolys = [EYE_L.map((i) => p[i]), EYE_R.map((i) => p[i])];
  let teethN = 0;
  let mouthN = 0;
  const chinPx: RGB[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const u = faceX[i];
      const v = faceY[i];
      if (v < eyeTop - 0.1 || v > chinFy + 0.35 || Math.abs(u) > 0.6) continue;
      const lab = labels[i];
      const au = Math.abs(u);
      const L = lum[i];
      const put = (z: ReturnType<typeof zone>) => {
        if (lab === SEG.background || lab === SEG.clothes || lab === SEG.hair) return;
        z.n++;
        z.sum += L;
        if (lab === SEG.other) z.other++;
        z.grain.push(Math.abs(L - box(x, y, rf)) / (L + 0.08));
      };
      if (au < 0.17 && v > noseFy + 0.012 && v < lipTopFy - 0.004) put(Z.lip);
      if (au < 0.14 && v > lipBotFy + 0.02 && v < chinFy - 0.01) {
        put(Z.chin);
        if (!(x % 2) && !(y % 2)) chinPx.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
      }
      if (au > 0.22 && au < 0.4 && v > mouthFy && v < chinFy - 0.06) put(Z.jaw);
      if (au > 0.14 && au < 0.32 && v > eyeBottom + 0.06 && v < noseFy) put(Z.cheek);
      // Edge strength across rows (glasses frames are mostly horizontal lines in front of the face),
      // against the lower cheeks, which frames never reach.
      const gy = Math.abs(lum[i + W] - lum[i - W]) + Math.abs(lum[i + 1] - lum[i - 1]) * 0.5;
      const row = Math.round(v * 200);
      if (v > eyeBottom + 0.02 && v < eyeBottom + 0.12) {
        if (u > eyeSpan[0] && u < eyeSpan[1]) addRow(rows.rimL, row, gy);
        if (u > eyeSpan[2] && u < eyeSpan[3]) addRow(rows.rimR, row, gy);
      }
      if (au < eyeInner * 0.6 && v > eyeTop - 0.04 && v < eyeBottom + 0.02) addRow(rows.bridge, row, gy);
      if (au > 0.4 && au < 0.52 && Math.abs(v - eyeMid) < 0.06) addRow(rows.temple, row, gy);
      if (au > 0.16 && au < 0.34 && v > noseFy - 0.05 && v < mouthFy && lab === SEG.faceSkin) addRow(rows.cheek, row, gy);
      if (v > eyeTop - 0.02 && v < eyeBottom + 0.02 && (inPoly(eyePolys[0], x, y) || inPoly(eyePolys[1], x, y))) put(Z.eyes);
      if (v > lipTopFy - 0.05 && v < lipBotFy + 0.02 && inPoly(lips, x, y)) {
        mouthN++;
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const mx = Math.max(r, g, b);
        if (L > Math.max(0.45, refL * 0.85) && mx > 0 && (mx - Math.min(r, g, b)) / mx < 0.3) teethN++;
      }
    }
  }
  const mean = (z: ReturnType<typeof zone>) => (z.n ? z.sum / z.n : refL);
  const cheekL = Z.cheek.n ? mean(Z.cheek) : refL;
  const cheekGrain = Math.max(0.004, median(Z.cheek.grain));
  const grain = (z: ReturnType<typeof zone>) => (z.n > 12 ? median(z.grain) / cheekGrain : 1);
  const fh: FacialHairZones = { lip: grain(Z.lip), chin: grain(Z.chin), jaw: grain(Z.jaw), lipLight: mean(Z.lip) / Math.max(0.02, cheekL) };
  const rowMax = (m: Map<number, [number, number]>) => Math.max(0, ...[...m.values()].filter(([, n]) => n >= 3).map(([s, n]) => s / n));
  const base = Math.max(0.01, rowMax(rows.cheek));
  const glassesC: GlassesClues = {
    rims: (rowMax(rows.rimL) + rowMax(rows.rimR)) / 2 / base,
    bridge: rowMax(rows.bridge) / base,
    temples: rowMax(rows.temple) / base,
    eyeDark: Z.eyes.n ? Math.max(0, 1 - mean(Z.eyes) / Math.max(0.05, cheekL)) : 0,
    accessory: frac(SEG.other, eyeSpan[0] - 0.05, eyeSpan[3] + 0.05, eyeTop - 0.06, eyeBottom + 0.08),
  };
  const teeth = mouthN > 8 ? teethN / mouthN : 0;

  const hairPick = classifyHair(hairM);
  const fhPick = classifyFacialHair(fh);
  // No hair on the head to measure: take the colour from the beard (it colours the whiskers anyway).
  // Whiskers are the chin pixels least like the skin around them.
  const skinLab = rgbToLab(skinRaw ?? skinRgb);
  const whiskers = chinPx
    .map((c) => ({ c, d: labDist(rgbToLab(c), skinLab) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, Math.ceil(chinPx.length * 0.4))
    .map((q) => q.c);
  const beardRaw = !hairRgb && !['none', 'stubble'].includes(fhPick.id) ? trimmedMean(whiskers, 0.1, 0.9) : null;
  const shownHair = hairRgb ?? (beardRaw ? fix(beardRaw) : null);
  const glassesPick = classifyGlasses(glassesC);
  const face = expressionFrom(blend, teeth);
  const wearsHat = hairM.hat > 0.45 && !!hatRgb;
  const traits: Traits = {
    skin: skinSwatch(skinRgb),
    hairColor: shownHair ? hairSwatch(shownHair, skinRgb) : HAIR_COLORS[1].color,
    hair: hairPick.id,
    facialHair: fhPick.id,
    glasses: glassesPick.id,
    mouth: face.mouth,
    eyes: face.eyes,
    brows: face.brows,
    hat: wearsHat ? 'beanie' : 'none',
    hatColor: wearsHat && hatRgb ? nearestCloth(fix(hatRgb)) : null,
    shirt: shirtRgb ? nearestCloth(shirtRgb) : null,
  };
  return {
    traits,
    measured: { skin: rgbToHex(skinRgb), hair: shownHair ? rgbToHex(shownHair) : null, shirt: shirtRgb ? rgbToHex(shirtRgb) : null },
    why: {
      hair: hairPick.why,
      facialHair: fhPick.why,
      glasses: glassesPick.why,
      mouth: face.why,
      hat: wearsHat ? 'something on your head' : undefined,
    },
    debug: {
      hair: hairM,
      facialHair: fh,
      glasses: glassesC,
      teeth,
      lab: { skin: skinRaw && rgbToLab(skinRaw), sclera: scleraRaw && rgbToLab(scleraRaw), hair: hairRaw && rgbToLab(hairRaw) },
    },
  };
}

/** Bounding oval for the photo crop: cheek to cheek, a little above the forehead to the chin. */
export function ovalFromLandmarks(p: Pt[]): { x: number; y: number; w: number; h: number } {
  const pts = FACE_OVAL.map((i) => p[i]);
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const lift = (y1 - y0) * 0.08;
  return { x: x0, y: y0 - lift, w: x1 - x0, h: y1 - y0 + lift };
}

/** Head tilt in radians (positive = tilted clockwise in the picture). */
export function headRoll(p: Pt[]): number {
  return Math.atan2(p[263].y - p[33].y, p[263].x - p[33].x);
}
