import type { CharacterState } from '../types';
import { deltaE, nearest, rgbToHex, type RGB } from './color';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../data/palette';

/** Minimal ImageData shape so the analysis can be unit-tested without a canvas. */
export interface Img {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Face oval bounds in image pixels: hairline to chin, ear to ear. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HairLength = 'bald' | 'short' | 'medium' | 'long';
export type FacialHairGuess = 'none' | 'mustache' | 'beard';

export interface Traits {
  skin: string;
  hairColor: string;
  hairLength: HairLength;
  facialHair: FacialHairGuess;
  glasses: boolean;
  smile: boolean;
  shirt: string | null;
}

export function isSkinRgb(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 40 && cb >= 77 && cb <= 130 && cr >= 134 && cr <= 176 && r > b;
}

function px(img: Img, x: number, y: number): RGB {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/** All pixels in a rectangle (clipped to the image), sampled on a grid. */
export function sampleRect(img: Img, x0: number, y0: number, x1: number, y1: number, maxSamples = 900): RGB[] {
  const ax = Math.max(0, Math.min(img.width - 1, Math.floor(Math.min(x0, x1))));
  const bx = Math.max(0, Math.min(img.width - 1, Math.ceil(Math.max(x0, x1))));
  const ay = Math.max(0, Math.min(img.height - 1, Math.floor(Math.min(y0, y1))));
  const by = Math.max(0, Math.min(img.height - 1, Math.ceil(Math.max(y0, y1))));
  const w = bx - ax;
  const h = by - ay;
  if (w <= 0 || h <= 0) return [];
  const step = Math.max(1, Math.sqrt((w * h) / maxSamples));
  const out: RGB[] = [];
  for (let y = ay; y <= by; y += step) for (let x = ax; x <= bx; x += step) out.push(px(img, x, y));
  return out;
}

export function median(pixels: RGB[]): RGB | null {
  if (!pixels.length) return null;
  const ch = (k: 0 | 1 | 2) => {
    const v = pixels.map((p) => p[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return [ch(0), ch(1), ch(2)];
}

const lum = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const sat = ([r, g, b]: RGB) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};
const fraction = (pixels: RGB[], test: (p: RGB) => boolean) => (pixels.length ? pixels.filter(test).length / pixels.length : 0);

/* ------------------------------------------------------------ detection */

interface Blob {
  score: number;
  count: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Biggest blob of pixels passing `test`, favouring the upper middle of the picture. */
function findBlob(img: Img, step: number, test: (p: RGB) => boolean): Blob | null {
  const { width: W, height: H } = img;
  const gw = Math.ceil(W / step);
  const gh = Math.ceil(H / step);
  const mask = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (test(px(img, Math.min(W - 1, gx * step), Math.min(H - 1, gy * step)))) mask[gy * gw + gx] = 1;
    }
  }
  const seen = new Uint8Array(gw * gh);
  let best: Blob | null = null;
  const queue: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let minX = gw, maxX = 0, minY = gh, maxY = 0, count = 0, sx = 0, sy = 0;
    queue.length = 0;
    queue.push(start);
    seen[start] = 1;
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % gw;
      const y = (i - x) / gw;
      count++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nbrs = [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, y > 0 ? i - gw : -1, y < gh - 1 ? i + gw : -1];
      for (const n of nbrs) {
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    if (count < gw * gh * 0.012) continue;
    const cx = sx / count / gw;
    const cy = sy / count / gh;
    const central = 1 - Math.min(1, Math.abs(cx - 0.5) * 1.4);
    const high = 1 - Math.min(1, Math.max(0, cy - 0.35) * 1.2);
    const score = count * (0.4 + central) * (0.5 + high);
    if (!best || score > best.score) best = { score, count, minX: minX * step, maxX: (maxX + 1) * step, minY: minY * step, maxY: (maxY + 1) * step };
  }
  return best;
}

/**
 * Finds the face: first the biggest skin-coloured blob near the upper middle, then a second
 * pass keyed to that blob's own colour, which drops dark hair and beards that also read as "skin".
 * Not science, but surprisingly decent for selfies.
 */
export function detectFaceBox(img: Img): Box {
  const { width: W, height: H } = img;
  const step = Math.max(1, Math.round(Math.max(W, H) / 160));
  const first = findBlob(img, step, (p) => isSkinRgb(...p));
  if (!first) return defaultBox(W, H);
  const skinSamples = sampleRect(img, first.minX, first.minY, first.maxX, first.maxY, 1500).filter((p) => isSkinRgb(...p));
  // The face is the brighter part of the blob; hair that sneaks into the skin range is darker.
  const sorted = [...skinSamples].sort((a, b) => lum(b) - lum(a));
  const faceColor = median(sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.6))));
  let blob = first;
  if (faceColor) {
    const refined = findBlob(img, step, (p) => deltaE(p, faceColor) < 20);
    if (refined && refined.count > first.count * 0.25) blob = refined;
  }
  const w = blob.maxX - blob.minX;
  const rawH = blob.maxY - blob.minY;
  const h = Math.max(Math.min(rawH, w * 1.32), w * 1.05);
  // Skin rarely reaches the hairline; nudge up a touch.
  return clampBox({ x: blob.minX, y: Math.max(0, blob.minY - h * 0.05), w, h }, W, H);
}

export function defaultBox(W: number, H: number): Box {
  const w = Math.min(W, H) * 0.42;
  const h = w * 1.28;
  return { x: (W - w) / 2, y: Math.max(0, H * 0.4 - h / 2), w, h };
}

export function clampBox(b: Box, W: number, H: number): Box {
  const w = Math.max(20, Math.min(b.w, W));
  const h = Math.max(24, Math.min(b.h, H));
  return { x: Math.max(0, Math.min(W - w, b.x)), y: Math.max(0, Math.min(H - h, b.y)), w, h };
}

/** Uses the browser's built-in face detector when there is one (Chromium with the Shape Detection API). */
export async function nativeFaceBox(source: CanvasImageSource): Promise<Box | null> {
  const FD = (window as unknown as { FaceDetector?: new (o: object) => { detect: (s: CanvasImageSource) => Promise<{ boundingBox: DOMRectReadOnly }[]> } }).FaceDetector;
  if (!FD) return null;
  try {
    const faces = await new FD({ fastMode: true, maxDetectedFaces: 1 }).detect(source);
    if (!faces.length) return null;
    const r = faces[0].boundingBox;
    // Detector boxes stop at the brows; stretch to the hairline.
    return { x: r.x, y: r.y - r.height * 0.18, w: r.width, h: r.height * 1.22 };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ analysis */

export function analyzeFace(img: Img, b: Box): Traits {
  const { x, y, w, h } = b;
  const R = (fx0: number, fy0: number, fx1: number, fy1: number) => sampleRect(img, x + w * fx0, y + h * fy0, x + w * fx1, y + h * fy1);

  // Skin: cheeks, preferring pixels that look like skin.
  const cheeks = [...R(0.14, 0.52, 0.34, 0.7), ...R(0.66, 0.52, 0.86, 0.7)];
  const skinish = cheeks.filter((p) => isSkinRgb(...p));
  const skin = median(skinish.length > cheeks.length * 0.25 ? skinish : cheeks) ?? [252, 217, 184];
  const skinL = lum(skin);
  const nearSkin = (p: RGB) => deltaE(p, skin) < 16;

  // Background: the picture's top corners and edges.
  const bgPixels = [
    ...sampleRect(img, 0, 0, img.width * 0.12, img.height * 0.35, 200),
    ...sampleRect(img, img.width * 0.88, 0, img.width, img.height * 0.35, 200),
  ];
  const bg = median(bgPixels);

  // Hair: the band just above the face plus the top of the oval (bangs). Hair is anything
  // there that is neither skin nor background.
  const hairZone = [...R(0.2, -0.22, 0.8, 0.0), ...R(0.15, 0.0, 0.85, 0.14)];
  const notBg = (p: RGB) => !bg || deltaE(p, bg) > 14;
  const hairPixels = hairZone.filter((p) => !nearSkin(p) && notBg(p));
  const hasHair = hairZone.length > 0 && hairPixels.length / hairZone.length > 0.22;
  const hairRgb: RGB = median(hairPixels) ?? median(hairZone) ?? [61, 35, 20];

  let hairLength: HairLength = 'short';
  if (!hasHair) hairLength = 'bald';
  else {
    const nearHair = (p: RGB) => deltaE(p, hairRgb) < 18;
    const hairVsBg = bg ? deltaE(hairRgb, bg) : 100;
    if (hairVsBg > 14) {
      const lowSides = Math.max(fraction(R(-0.24, 0.62, 0.04, 1.1), nearHair), fraction(R(0.96, 0.62, 1.24, 1.1), nearHair));
      const midSides = Math.max(fraction(R(-0.2, 0.25, 0.04, 0.6), nearHair), fraction(R(0.96, 0.25, 1.2, 0.6), nearHair));
      if (lowSides > 0.4) hairLength = 'long';
      else if (midSides > 0.4) hairLength = 'medium';
    }
  }

  // Facial hair: dark, non-skin pixels around the chin and upper lip.
  const darkNonSkin = (p: RGB) => !nearSkin(p) && lum(p) < skinL * 0.72 && (deltaE(p, hairRgb) < 26 || lum(p) < 0.3);
  const chin = fraction(R(0.3, 0.84, 0.7, 1.0), darkNonSkin);
  const lip = fraction(R(0.38, 0.66, 0.62, 0.74), darkNonSkin);
  const facialHair: FacialHairGuess = chin > 0.55 ? 'beard' : lip > 0.55 ? 'mustache' : 'none';

  // Glasses: the bridge of the nose normally shows skin.
  const bridge = R(0.44, 0.36, 0.56, 0.44);
  const glasses = fraction(bridge, (p) => deltaE(p, skin) > 24 && lum(p) < skinL * 0.8) > 0.42;

  // Smile: visible teeth.
  const mouth = R(0.32, 0.7, 0.68, 0.84);
  const smile = fraction(mouth, (p) => lum(p) > 0.68 && sat(p) < 0.25) > 0.07;

  // Shirt: below the chin.
  const shirtPixels = sampleRect(img, x + w * 0.05, y + h * 1.35, x + w * 0.95, y + h * 1.95, 600);
  const shirtMed = shirtPixels.length > 40 ? median(shirtPixels) : null;

  return {
    skin: nearest(skin, SKIN_TONES.slice(0, 10).map((s) => s.color)),
    hairColor: nearest(hairRgb, HAIR_COLORS.slice(0, 10).map((s) => s.color)),
    hairLength,
    facialHair,
    glasses,
    smile,
    shirt: shirtMed ? nearest(shirtMed, CLOTH_COLORS) : null,
  };
}

export function rawHex(rgb: RGB): string {
  return rgbToHex(rgb);
}

/** Apply detected traits to a character. */
export function traitsToCharacter(base: CharacterState, t: Traits, photoFace: string | null, usePhotoFace: boolean): CharacterState {
  const hairByLength: Record<HairLength, string> = {
    bald: 'bald',
    short: ['messy', 'sidepart', 'spiky', 'buzz', 'curly', 'flattop', 'pixie'].includes(base.hair) ? base.hair : 'messy',
    medium: 'bob',
    long: ['long', 'wavy', 'braids', 'ponytail', 'pigtails'].includes(base.hair) ? base.hair : 'long',
  };
  const facialHair = t.facialHair === 'beard' ? 'beard' : t.facialHair === 'mustache' ? 'mustache' : 'none';
  const grownUp = facialHair !== 'none' && ['kid', 'husky', 'skinny'].includes(base.body);
  return {
    ...base,
    skin: t.skin,
    hairColor: t.hairColor,
    hair: hairByLength[t.hairLength],
    facialHair,
    glasses: t.glasses ? (base.glasses !== 'none' ? base.glasses : 'round') : 'none',
    mouth: t.smile ? 'grin' : 'smile',
    topColor: t.shirt ?? base.topColor,
    hat: 'none',
    body: grownUp ? (base.body === 'husky' ? 'dadbod' : 'adult') : base.body,
    nose: grownUp ? 'adult' : base.nose,
    photoFace,
    usePhotoFace: usePhotoFace && !!photoFace,
  };
}

/** Crop the face oval to a small image; optional posterize for that cut-out look. */
export function cropFace(source: HTMLCanvasElement, b: Box, posterize: boolean): string {
  const out = document.createElement('canvas');
  out.width = 240;
  out.height = 268;
  const ctx = out.getContext('2d')!;
  const mx = b.w * 0.04;
  const my = b.h * 0.03;
  ctx.drawImage(source, b.x - mx, b.y - my, b.w + mx * 2, b.h + my * 2, 0, 0, out.width, out.height);
  if (posterize) {
    const d = ctx.getImageData(0, 0, out.width, out.height);
    const levels = 6;
    for (let i = 0; i < d.data.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const v = d.data[i + k] / 255;
        const boosted = Math.min(1, Math.max(0, (v - 0.5) * 1.18 + 0.52));
        d.data[i + k] = Math.round(Math.round(boosted * (levels - 1)) / (levels - 1) * 255);
      }
    }
    ctx.putImageData(d, 0, 0);
  }
  // Keep only the face oval so the photo's background never shows.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.ellipse(out.width / 2, out.height / 2, out.width / 2 - 4, out.height / 2 - 4, 0, 0, Math.PI * 2);
  ctx.fill();
  return out.toDataURL('image/png');
}
