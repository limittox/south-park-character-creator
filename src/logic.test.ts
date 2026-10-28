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
    expect(t.hairLength).not.toBe('bald');
    expect(['#1e1a1a', '#3d2314']).toContain(t.hairColor);
    expect(t.shirt).toBe('#2e8b47');
    expect(t.smile).toBe(true);
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
