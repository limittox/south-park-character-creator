import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER, normalizeCharacter } from './data/defaults';
import { decodeCharacter, encodeCharacter, characterFromHash } from './lib/share';
import { applyItem, isSelected } from './lib/apply';
import { randomCharacter, randomizeCategory } from './lib/random';
import { ALL_CATS, CATEGORIES, findItem } from './data/catalog';
import { seeded } from './character/parts/common';
import { analyzeFace, detectFaceBox, traitsToCharacter, type Img } from './lib/photoAnalysis';
import { wrapSign } from './character/parts/held';
import { muffle } from './lib/speech';
import { accent, deltaE, hexToRgb, nearest, rgbToHex, shade } from './lib/color';
import { makeProfile, wrapText } from './components/CharacterCard';
import { BODY_GEOS, charFrame, GROUND_Y } from './character/geometry';
import { FLAT_CSS } from './character/flat';
import {
  classifyFacialHair,
  classifyGlasses,
  classifyHair,
  EYE_L,
  EYE_R,
  expressionFrom,
  FACE_OVAL,
  hairSwatch,
  readFace,
  SEG,
  skinSwatch,
  type HairMetrics,
  type Pt,
} from './lib/faceTraits';
import { SKIN_TONES } from './data/palette';

describe('share links', () => {
  it('round-trips a character and never includes the photo face', () => {
    const c = { ...randomCharacter(seeded(5)), name: 'Zoë “Snowcone” O\'Hara', photoFace: 'data:image/png;base64,AAAA', usePhotoFace: true };
    const code = encodeCharacter(c);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeCharacter(code)!;
    expect(back).toEqual({ ...c, photoFace: null, usePhotoFace: false });
  });

  it('encodes the default character compactly', () => {
    expect(encodeCharacter(DEFAULT_CHARACTER).length).toBeLessThan(8);
  });

  it('rejects garbage', () => {
    expect(decodeCharacter('!!!')).toBeNull();
    expect(decodeCharacter('bm90IGpzb24')).toBeNull();
    expect(characterFromHash('#nothing')).toBeNull();
  });

  it('reads a character from a URL hash', () => {
    const c = { ...DEFAULT_CHARACTER, name: 'Hash Kid', hat: 'crown' };
    expect(characterFromHash(`#c=${encodeCharacter(c)}`)?.hat).toBe('crown');
  });
});

describe('normalizeCharacter', () => {
  it('fills missing fields and drops wrong types', () => {
    const n = normalizeCharacter({ name: 'X', hat: 42 as unknown as string, usePhotoFace: 'yes' as unknown as boolean, photoFace: 'javascript:alert(1)' });
    expect(n.name).toBe('X');
    expect(n.hat).toBe(DEFAULT_CHARACTER.hat);
    expect(n.usePhotoFace).toBe(false);
    expect(n.photoFace).toBeNull();
  });

  it('caps very long strings', () => {
    expect(normalizeCharacter({ name: 'a'.repeat(5000) }).name.length).toBe(200);
  });
});

describe('catalog', () => {
  it('has unique item ids in every category', () => {
    for (const cat of ALL_CATS) {
      const ids = CATEGORIES[cat].items.map((i) => i.id);
      expect(new Set(ids).size, cat).toBe(ids.length);
      for (const item of CATEGORIES[cat].items) {
        expect(item.name, `${cat}/${item.id}`).toBeTruthy();
        expect(item.quip.length, `${cat}/${item.id}`).toBeGreaterThan(5);
      }
    }
  });

  it('default character uses real items', () => {
    for (const cat of ALL_CATS) {
      const field = CATEGORIES[cat].field;
      if (!field || cat === 'skin' || cat === 'hairColor') continue;
      expect(findItem(cat, String(DEFAULT_CHARACTER[field])), cat).toBeDefined();
    }
  });
});

describe('show proportions', () => {
  const height = (body: string) => GROUND_Y + 4 - (BODY_GEOS[body].headCy - BODY_GEOS[body].headRy);

  it('gives kids near-round heads', () => {
    for (const body of ['kid', 'skinny']) {
      const g = BODY_GEOS[body];
      expect(g.headRy / g.headRx).toBeGreaterThan(0.98);
      expect(g.headRy / g.headRx).toBeLessThan(1.1);
    }
  });

  it('makes grown-ups about one and a half kids tall', () => {
    for (const adult of ['adult', 'dadbod', 'lanky', 'buff']) {
      const ratio = height(adult) / height('kid');
      expect(ratio).toBeGreaterThan(1.4);
      expect(ratio).toBeLessThan(1.8);
    }
  });

  it('frames every body with room for a tall hat and the feet', () => {
    for (const g of Object.values(BODY_GEOS)) {
      const f = charFrame(g);
      expect(f.y).toBeLessThan(g.headCy - g.headRy * 2);
      expect(f.y + f.h).toBeGreaterThan(g.footY + g.footRy + 10);
      expect(f.x).toBeLessThan(g.cx - 186 - 40);
    }
  });
});

describe('flat show style', () => {
  const selector = FLAT_CSS.slice(0, FLAT_CSS.indexOf('{'));
  const el = (markup: string) => {
    const root = document.createElement('div');
    root.innerHTML = `<svg><g class="sp-char">${markup}</g></svg>`;
    return root.querySelector('g > *')!;
  };

  it('drops outlines from filled shapes', () => {
    expect(el('<path stroke="#1d1d1d" fill="#fcd9b8"/>').matches(selector)).toBe(true);
    expect(el('<path class="ol" stroke="#1d1d1d" fill="none"/>').matches(selector)).toBe(true);
  });

  it('keeps interior lines and deliberate outlines', () => {
    expect(el('<path stroke="#1d1d1d" fill="none"/>').matches(selector)).toBe(false);
    expect(el('<path stroke="#1d1d1d"/>').matches(selector)).toBe(false);
    expect(el('<path class="keep" stroke="#1d1d1d" fill="#fff"/>').matches(selector)).toBe(false);
  });
});

describe('applyItem', () => {
  it('applies the item default colour when the slot was not dyed', () => {
    const c = applyItem({ ...DEFAULT_CHARACTER, neck: 'none' }, 'neck', 'scarf');
    expect(c.neck).toBe('scarf');
    expect(c.neckColor).toBe(findItem('neck', 'scarf')!.defaultColor);
  });

  it('keeps a custom dye', () => {
    const dyed = { ...DEFAULT_CHARACTER, topColor: '#123456' };
    expect(applyItem(dyed, 'top', 'hoodie').topColor).toBe('#123456');
  });

  it('moods set eyes, brows and mouth together', () => {
    const c = applyItem(DEFAULT_CHARACTER, 'mood', 'angry');
    expect([c.eyes, c.brows, c.mouth]).toEqual(['angry', 'angry', 'frown']);
    expect(isSelected(c, 'mood', 'angry')).toBe(true);
    expect(isSelected(c, 'mood', 'happy')).toBe(false);
  });
});

describe('randomizer', () => {
  it('only produces valid items', () => {
    for (let seed = 1; seed < 60; seed++) {
      const c = randomCharacter(seeded(seed));
      for (const cat of ALL_CATS) {
        const field = CATEGORIES[cat].field;
        if (!field || cat === 'skin' || cat === 'hairColor') continue;
        expect(findItem(cat, String(c[field])), `${seed}:${cat}=${c[field]}`).toBeDefined();
      }
      expect(c.name).toMatch(/\S+ \S+/);
    }
  });

  it('randomizing one category leaves the rest alone', () => {
    const before = { ...DEFAULT_CHARACTER };
    const after = randomizeCategory(before, 'hat', seeded(3));
    expect({ ...after, hat: before.hat, hatColor: before.hatColor }).toEqual(before);
  });
});

describe('colour helpers', () => {
  it('converts and shades', () => {
    expect(rgbToHex(hexToRgb('#3b6fd8'))).toBe('#3b6fd8');
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(deltaE([10, 10, 10], [10, 10, 10])).toBe(0);
    expect(nearest([250, 0, 0], ['#00ff00', '#ff0000'])).toBe('#ff0000');
    expect(accent('#3b6fd8')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('text helpers', () => {
  it('wraps sign text into at most three lines', () => {
    expect(wrapSign('we want more recess and fewer vegetables please')).toHaveLength(3);
    expect(wrapSign('hi')).toEqual(['HI']);
  });
  it('wraps card text', () => {
    expect(wrapText('one two three four five six', 9)).toEqual(['one two', 'three', 'four five', 'six']);
  });
  it('muffles speech', () => {
    expect(muffle('Hello there, friend!')).toMatch(/^M+m*\w* M+m*\w*,? M+m*\w*!$/);
    expect(muffle('Hello there').split(' ')).toHaveLength(2);
  });
  it('makes stable profiles', () => {
    const a = makeProfile(DEFAULT_CHARACTER, 0);
    expect(makeProfile(DEFAULT_CHARACTER, 0)).toEqual(a);
    expect(a.stats).toHaveLength(6);
    expect(a.stats.every((s) => s.value >= 1 && s.value <= 10)).toBe(true);
  });
});

/* -------- photo analysis on a synthetic selfie -------- */

function fakeSelfie(): Img {
  const W = 300;
  const H = 380;
  const data = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, [r, g, b]: number[]) => {
    const i = (y * W + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col = [106, 169, 216]; // blue wall
      if (y > 300) col = [46, 139, 71]; // green shirt
      if (inEllipse(x, y, 150, 120, 78, 92)) col = [40, 30, 28]; // dark hair
      if (inEllipse(x, y, 150, 150, 60, 80)) col = [198, 138, 86]; // skin
      if (inEllipse(x, y, 150, 205, 26, 9) && y < 205) col = [250, 250, 250]; // teeth
      put(x, y, col);
    }
  }
  return { data, width: W, height: H };
}

describe('photo analysis', () => {
  const img = fakeSelfie();

  it('finds the face on a synthetic selfie', () => {
    const box = detectFaceBox(img);
    expect(box.x).toBeGreaterThan(70);
    expect(box.x + box.w).toBeLessThan(230);
    expect(box.y).toBeGreaterThan(50);
    expect(box.y).toBeLessThan(100);
    expect(box.w).toBeGreaterThan(90);
  });

  it('reads skin, hair, shirt and smile', () => {
    const t = analyzeFace(img, { x: 90, y: 70, w: 120, h: 160 });
    expect(t.skin).toBe('#c68a56');
    expect(t.hair).not.toBe('bald');
    expect(['#1e1a1a', '#3d2314']).toContain(t.hairColor);
    expect(t.shirt).toBe('#2e8b47');
    expect(t.mouth).toBe('grin');
    expect(t.facialHair).toBe('none');
  });

  it('turns traits into a character', () => {
    const t = analyzeFace(img, { x: 90, y: 70, w: 120, h: 160 });
    const c = traitsToCharacter(DEFAULT_CHARACTER, t, null, true);
    expect(c.skin).toBe(t.skin);
    expect(c.hat).toBe('none');
    expect(c.usePhotoFace).toBe(false);
    const bearded = traitsToCharacter(DEFAULT_CHARACTER, { ...t, facialHair: 'beard' }, 'data:image/png;base64,x', true);
    expect(bearded.body).toBe('adult');
    expect(bearded.usePhotoFace).toBe(true);
  });
});

/* -------- face scanner: traits from landmarks and pixel labels -------- */

const hairM = (o: Partial<HairMetrics>): HairMetrics => ({
  crown: 0.6,
  width: 0.65,
  length: -0.2,
  cheeks: 0,
  bangs: 0,
  bangsLeft: 0,
  bangsRight: 0,
  eyeCover: 0,
  sides: 0.2,
  lightness: 25,
  temples: 0.4,
  strip: 0.6,
  strands: false,
  thickness: 0.2,
  hat: 0,
  ...o,
});

describe('face scanner rules', () => {
  it('names hairstyles from the hair shape', () => {
    expect(classifyHair(hairM({ crown: 0, length: -0.5, thickness: 0, sides: 0 })).id).toBe('bald');
    expect(classifyHair(hairM({ crown: 0, length: -0.5, thickness: 0, sides: 0.5 })).id).toBe('horseshoe');
    expect(classifyHair(hairM({ length: 1.2, cheeks: 0.8 })).id).toBe('long');
    expect(classifyHair(hairM({ length: 0.75, thickness: 0.6, width: 1.4, cheeks: 0.9 })).id).toBe('wavy');
    expect(classifyHair(hairM({ length: 0.5, thickness: 0.31, width: 0.8 })).id).toBe('bob');
    expect(classifyHair(hairM({ thickness: 0.6, width: 1.1 })).id).toBe('afro');
    expect(classifyHair(hairM({ thickness: 0.45, width: 0.75 })).id).toBe('curly');
    expect(classifyHair(hairM({ thickness: 0.12 })).id).toBe('buzz');
    // Grey hair reads thinner to the segmenter, so it takes less to count as more than a buzz cut.
    expect(classifyHair(hairM({ thickness: 0.12, lightness: 80 })).id).toBe('sidepart');
    expect(classifyHair(hairM({ thickness: 0.3 })).id).toBe('messy');
    expect(classifyHair(hairM({ eyeCover: 0.5, bangs: 0.5 })).id).toBe('emo');
  });

  it('tells beards, moustaches and clean shaves apart by grain', () => {
    expect(classifyFacialHair({ lip: 6, chin: 5, jaw: 6, lipLight: 0.8 }).id).toBe('beard');
    expect(classifyFacialHair({ lip: 1.2, chin: 4, jaw: 4, lipLight: 1 }).id).toBe('chinstrap');
    expect(classifyFacialHair({ lip: 4, chin: 3.5, jaw: 1.3, lipLight: 0.8 }).id).toBe('goatee');
    expect(classifyFacialHair({ lip: 7, chin: 1.4, jaw: 1.7, lipLight: 0.34 }).id).toBe('mustache');
    // A white moustache on darker skin is bright rather than grainy.
    expect(classifyFacialHair({ lip: 1.1, chin: 0.6, jaw: 0.9, lipLight: 1.4 }).id).toBe('mustache');
    // A shadowy upper lip alone is not a moustache.
    expect(classifyFacialHair({ lip: 2.4, chin: 1.3, jaw: 1.9, lipLight: 0.9 }).id).toBe('none');
    expect(classifyFacialHair({ lip: 1.4, chin: 1.2, jaw: 1.3, lipLight: 0.95 }).id).toBe('none');
  });

  it('spots glasses by the frame across the nose', () => {
    expect(classifyGlasses({ rims: 0.8, bridge: 0.6, temples: 0.6, eyeDark: 0.45, accessory: 0 }).id).toBe('none');
    expect(classifyGlasses({ rims: 0.9, bridge: 2.8, temples: 2.1, eyeDark: 0.6, accessory: 0.14 }).id).toBe('square');
    expect(classifyGlasses({ rims: 0.9, bridge: 1.8, temples: 1, eyeDark: 0.5, accessory: 0.12 }).id).toBe('round');
    expect(classifyGlasses({ rims: 1, bridge: 2, temples: 1.5, eyeDark: 0.9, accessory: 0.4 }).id).toBe('sunglasses');
  });

  it('reads expressions from the landmarker scores', () => {
    expect(expressionFrom({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8, jawOpen: 0.2 }, 0.4).mouth).toBe('grin');
    expect(expressionFrom({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6 }, 0).mouth).toBe('smile');
    expect(expressionFrom({}, 0).mouth).toBe('flat');
    expect(expressionFrom({ jawOpen: 0.7, mouthFunnel: 0.4 }, 0).mouth).toBe('oshock');
    expect(expressionFrom({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1 }, 0).eyes).toBe('wink');
    // Smiling pulls the brows down too; that is not an angry face.
    expect(expressionFrom({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8, browDownLeft: 0.6, browDownRight: 0.6 }, 0.3).brows).toBeNull();
    expect(expressionFrom({ browDownLeft: 0.7, browDownRight: 0.7 }, 0).brows).toBe('angry');
  });

  it('ranks skin tones from light to dark', () => {
    const idx = (rgb: [number, number, number]) => SKIN_TONES.findIndex((t) => t.color === skinSwatch(rgb));
    expect(idx([240, 214, 200])).toBeLessThanOrEqual(1);
    expect(idx([198, 150, 120])).toBeGreaterThan(idx([232, 196, 176]));
    expect(idx([150, 100, 70])).toBeGreaterThan(idx([198, 150, 120]));
    expect(idx([88, 58, 44])).toBeGreaterThanOrEqual(7);
  });

  it('names hair colours, spotting grey against the skin', () => {
    const skin: [number, number, number] = [225, 180, 155];
    expect(hairSwatch([22, 20, 20], skin)).toBe('#1e1a1a');
    expect(hairSwatch([120, 120, 124], skin)).toBe('#9a9a9a');
    expect(hairSwatch([140, 140, 165], skin)).toBe('#9a9a9a');
    expect(hairSwatch([235, 233, 232], skin)).toBe('#eeeeee');
    expect(hairSwatch([196, 158, 88], skin)).toBe('#e9c766');
    expect(hairSwatch([120, 84, 60], skin)).toBe('#6e4224');
    expect(hairSwatch([72, 48, 36], skin)).toBe('#3d2314');
    expect(hairSwatch([60, 110, 220], skin)).toBe('#3b7dd8');
    expect(hairSwatch([205, 100, 45], skin)).toBe('#d2622a');
  });
});

/** A synthetic scanned head: landmarks for a 120 x 150 face plus a labelled picture. */
function fakeScan(opts: { beard: boolean; longHair: boolean }) {
  const W = 400;
  const H = 420;
  const cx = 200;
  const cy = 200;
  const pts: Pt[] = Array.from({ length: 478 }, () => ({ x: cx, y: cy }));
  const ring = (ids: number[], x: number, y: number, rx: number, ry: number) =>
    ids.forEach((id, k) => (pts[id] = { x: x + rx * Math.cos((k / ids.length) * Math.PI * 2), y: y + ry * Math.sin((k / ids.length) * Math.PI * 2) }));
  ring(FACE_OVAL, cx, cy, 60, 75);
  pts[10] = { x: cx, y: cy - 75 };
  pts[152] = { x: cx, y: cy + 75 };
  pts[234] = { x: cx - 60, y: cy };
  pts[454] = { x: cx + 60, y: cy };
  ring(EYE_L, 175, 182, 13, 6);
  ring(EYE_R, 225, 182, 13, 6);
  pts[33] = { x: 162, y: 182 };
  pts[263] = { x: 238, y: 182 };
  pts[468] = { x: 175, y: 182 };
  pts[473] = { x: 225, y: 182 };
  for (let k = 1; k <= 4; k++) {
    pts[468 + k] = { x: 175 + 4 * Math.cos(k * 1.6), y: 182 + 4 * Math.sin(k * 1.6) };
    pts[473 + k] = { x: 225 + 4 * Math.cos(k * 1.6), y: 182 + 4 * Math.sin(k * 1.6) };
  }
  pts[105] = { x: 175, y: 168 };
  pts[334] = { x: 225, y: 168 };
  pts[2] = { x: cx, y: 222 };
  pts[0] = { x: cx, y: 234 };
  pts[17] = { x: cx, y: 252 };
  pts[61] = { x: 184, y: 243 };
  pts[291] = { x: 216, y: 243 };
  ring([78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95], cx, 243, 13, 2);

  const data = new Uint8ClampedArray(W * H * 4);
  const labels = new Uint8Array(W * H);
  const inE = (x: number, y: number, ex: number, ey: number, rx: number, ry: number) => ((x - ex) / rx) ** 2 + ((y - ey) / ry) ** 2 <= 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col = [90, 140, 210];
      let lab: number = SEG.background;
      if (y > 300) [col, lab] = [[46, 139, 71], SEG.clothes];
      if (inE(x, y, cx, 150, 68, 62) || (opts.longHair && y > 150 && y < 390 && Math.abs(x - cx) > 62 && Math.abs(x - cx) < 85)) [col, lab] = [[60, 38, 24], SEG.hair];
      if (inE(x, y, cx, cy, 60, 75) && y > 132) {
        lab = SEG.faceSkin;
        col = [226, 182, 156];
        // Whiskers: a fine speckle over the upper lip, chin and jaw.
        if (opts.beard && y > 224 && (x + y) % 2) col = [70, 50, 40];
      }
      if (inE(x, y, 175, 182, 13, 6) || inE(x, y, 225, 182, 13, 6)) col = [236, 234, 232];
      if (inE(x, y, 175, 182, 4, 4) || inE(x, y, 225, 182, 4, 4)) col = [60, 40, 30];
      const i = y * W + x;
      data.set([col[0], col[1], col[2], 255], i * 4);
      labels[i] = lab;
    }
  }
  return { seg: { img: { data, width: W, height: H }, labels, x: 0, y: 0, scale: 1 }, pts };
}

describe('face scanner read', () => {
  it('reads a long-haired, bearded head', () => {
    const { seg, pts } = fakeScan({ beard: true, longHair: true });
    const r = readFace(seg, pts, { mouthSmileLeft: 0.7, mouthSmileRight: 0.7 });
    expect(r.traits.hair).toBe('long');
    expect(r.traits.facialHair).toBe('beard');
    expect(r.traits.glasses).toBe('none');
    expect(r.traits.shirt).toBe('#2e8b47');
    expect(r.traits.mouth).toBe('smile');
    expect(SKIN_TONES.slice(0, 4).map((t) => t.color)).toContain(r.traits.skin);
    expect(['#3d2314', '#6e4224']).toContain(r.traits.hairColor);
    const c = traitsToCharacter(DEFAULT_CHARACTER, r.traits, null, false);
    expect(c.body).toBe('adult');
    expect(c.facialHair).toBe('beard');
  });

  it('reads a short-haired, clean-shaven head', () => {
    const { seg, pts } = fakeScan({ beard: false, longHair: false });
    const r = readFace(seg, pts, {});
    expect(['buzz', 'sidepart', 'messy']).toContain(r.traits.hair);
    expect(r.traits.facialHair).toBe('none');
    expect(r.traits.mouth).toBe('flat');
    expect(traitsToCharacter(DEFAULT_CHARACTER, r.traits, null, false).body).toBe(DEFAULT_CHARACTER.body);
  });
});
