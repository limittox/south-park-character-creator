import { memo, useMemo, useState } from 'react';
import type { CategoryId, CharacterState } from '../types';
import { CATEGORIES, GROUPS, groupOf, findItem, thumbViewBox, type CatalogItem } from '../data/catalog';
import { applyItem, isSelected } from '../lib/apply';
import { frameViewBox, getGeo } from '../character/geometry';
import { CharacterSvg } from '../character/Character';

interface Props {
  c: CharacterState;
  activeCat: CategoryId;
  onCat: (cat: CategoryId) => void;
  onPick: (cat: CategoryId, id: string) => void;
  onColor: (field: keyof CharacterState, color: string) => void;
  onRandomCat: (cat: CategoryId) => void;
  onSignText: (text: string) => void;
  onTogglePhotoFace: () => void;
}

const Thumb = memo(
  function Thumb({ preview, viewBox }: { preview: CharacterState; viewBox: string; sig: string }) {
    return <CharacterSvg c={preview} viewBox={viewBox} />;
  },
  (a, b) => a.sig === b.sig && a.viewBox === b.viewBox,
);

export function Catalog({ c, activeCat, onCat, onPick, onColor, onRandomCat, onSignText, onTogglePhotoFace }: Props) {
  const [hovered, setHovered] = useState<CatalogItem | null>(null);
  const def = CATEGORIES[activeCat];
  const group = groupOf(activeCat);

  const previews = useMemo(
    () =>
      def.items.map((item) => {
        let preview = applyItem(c, activeCat, item.id);
        if (def.thumb) preview = { ...preview, ...def.thumb };
        // Long coats and dresses hide the legs; show bottoms on a t-shirt instead.
        if ((activeCat === 'bottom' || activeCat === 'shoes') && ['labcoat', 'dress', 'gothcoat', 'robe', 'gown', 'poncho'].includes(preview.top)) {
          preview = { ...preview, top: 'tshirt' };
        }
        // Photo faces are big data URLs; fingerprint them instead of stringifying every byte.
        const face = preview.photoFace ? `${preview.photoFace.length}:${preview.photoFace.slice(-24)}` : null;
        return { item, preview, sig: JSON.stringify({ ...preview, photoFace: face }) };
      }),
    [c, activeCat, def],
  );

  const viewBox = thumbViewBox(def.view, getGeo(c.body, c.headShape));
  const currentId = def.field ? String(c[def.field]) : '';
  const current = def.field ? findItem(activeCat, currentId) : undefined;
  const showPalette = !!def.colorField && !!def.palette && current?.colorable !== false && currentId !== 'none';
  const shown = hovered ?? current ?? def.items.find((i) => isSelected(c, activeCat, i.id)) ?? null;

  return (
    <section className="panel catalog" aria-label="Item catalog">
      <div className="catalog-head">
      <div className="groups" role="tablist" aria-label="Item groups">
        {GROUPS.map((g) => (
          <button key={g.id} className="group-btn" role="tab" aria-selected={g.id === group.id} onClick={() => onCat(g.cats[0])}>
            <span className="emoji" aria-hidden="true">
              {g.icon}
            </span>
            {g.label}
          </button>
        ))}
      </div>

      <div className="cats" role="tablist" aria-label={`${group.label} categories`}>
        {group.cats.map((cat) => (
          <button key={cat} className="cat-pill" role="tab" aria-selected={cat === activeCat} onClick={() => onCat(cat)}>
            {CATEGORIES[cat].label}
          </button>
        ))}
        <div className="cat-tools">
          <button className="btn small" onClick={() => onRandomCat(activeCat)} title={`Random ${def.label.toLowerCase()}`}>
            🎲 Random
          </button>
        </div>
      </div>
      <div className="hint">{def.hint}</div>

      {activeCat === 'skin' && c.photoFace && (
        <div className="sign-edit">
          <span style={{ fontWeight: 900 }}>📸 Photo face:</span>
          <button className={`btn small ${c.usePhotoFace ? 'red' : ''}`} onClick={onTogglePhotoFace}>
            {c.usePhotoFace ? 'ON (cursed)' : 'OFF'}
          </button>
        </div>
      )}

      {activeCat === 'held' && c.held === 'sign' && (
        <label className="sign-edit">
          <span style={{ fontWeight: 900 }}>Sign says:</span>
          <input value={c.signText} maxLength={36} onChange={(e) => onSignText(e.target.value)} placeholder="WE WANT RECESS" />
        </label>
      )}

      {showPalette && def.colorField && def.palette && (
        <div className="palette" role="group" aria-label="Colours">
          <span className="palette-label">Dye it:</span>
          {def.palette.map((col) => (
            <button
              key={col}
              className="swatch"
              style={{ background: col }}
              aria-label={`Colour ${col}`}
              aria-pressed={String(c[def.colorField!]).toLowerCase() === col.toLowerCase()}
              onClick={() => onColor(def.colorField!, col)}
            />
          ))}
          <label className="swatch custom" title="Any colour you like">
            <span className="sr-only">Custom colour</span>
            <input type="color" value={String(c[def.colorField])} onChange={(e) => onColor(def.colorField!, e.target.value)} />
          </label>
        </div>
      )}
      </div>

      <div className="grid" role="list" onMouseLeave={() => setHovered(null)}>
        {previews.map(({ item, preview, sig }) => (
          <button
            key={item.id}
            role="listitem"
            className={`item${item.swatch ? ' swatch-item' : ''}`}
            aria-pressed={isSelected(c, activeCat, item.id)}
            onClick={() => onPick(activeCat, item.id)}
            onMouseEnter={() => setHovered(item)}
            onFocus={() => setHovered(item)}
            title={item.name}
          >
            <Thumb preview={preview} viewBox={def.view === 'full' ? frameViewBox(getGeo(preview.body, preview.headShape)) : viewBox} sig={sig} />
            <span className="label">
              {item.swatch && <span style={{ width: 10, height: 10, borderRadius: 5, background: item.swatch, border: '1.5px solid #1d1d1d', marginRight: 4, flex: 'none' }} />}
              {item.name}
            </span>
          </button>
        ))}
      </div>

      <div className="info-bar" aria-live="polite">
        {shown ? (
          <>
            <b>{shown.name}</b>
            {shown.quip}
          </>
        ) : (
          <span>Hover over an item for the inside scoop.</span>
        )}
      </div>
    </section>
  );
}
