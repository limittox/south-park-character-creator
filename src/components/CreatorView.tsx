import { useCallback, useEffect, useRef, useState } from 'react';
import type { CategoryId, CharacterState } from '../types';
import { CharacterGroup } from '../character/Character';
import { Catalog } from './Catalog';
import { CATEGORIES, findItem } from '../data/catalog';
import { applyItem, isSelected } from '../lib/apply';
import { randomCharacter, randomizeCategory, randomName, pick } from '../lib/random';
import { sfx } from '../lib/sound';
import { news, toast } from '../lib/toast';
import { NEWS_TEMPLATES, POKE_REACTIONS, RANDOM_QUIPS, TALK_SUGGESTIONS } from '../data/humor';
import { muffle, speak, VOICES } from '../lib/speech';
import { HATS } from '../character/parts/hats';
import { StageBackdrop } from '../scenes/backgrounds';

interface Props {
  c: CharacterState;
  set: (next: CharacterState | ((p: CharacterState) => CharacterState), key?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onCard: () => void;
  onPhoto: () => void;
  onBooth: () => void;
  onShare: () => void;
}

const STAGE_VIEWBOX = '-95 -78 590 590';

export function CreatorView({ c, set, undo, redo, canUndo, canRedo, onSave, onCard, onPhoto, onBooth, onShare }: Props) {
  const [activeCat, setActiveCat] = useState<CategoryId>('hair');
  const [popKey, setPopKey] = useState(0);
  const [shake, setShake] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [talk, setTalk] = useState(0);
  const [line, setLine] = useState('');
  const [voice, setVoice] = useState(VOICES[0].id);
  const stopRef = useRef<(() => void) | null>(null);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const catalogRef = useRef<HTMLDivElement>(null);

  const bump = () => setPopKey((k) => k + 1);

  const pickItem = useCallback(
    (cat: CategoryId, id: string) => {
      set((prev) => applyItem(prev, cat, id));
      bump();
      sfx.pop();
      const item = findItem(cat, id);
      if (item && id !== 'none' && Math.random() < 0.5) {
        news(pick(NEWS_TEMPLATES).replace('{name}', c.name || 'Local kid').replace('{item}', item.name.toLowerCase()));
      }
    },
    [set, c.name],
  );

  const randomizeAll = useCallback(() => {
    set((prev) => randomCharacter(Math.random, false, prev));
    bump();
    sfx.whoosh();
    toast(pick(RANDOM_QUIPS));
  }, [set]);

  const showBubble = (text: string, ms = 1800) => {
    setBubble(text);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };

  const onPartClick = (cat: CategoryId) => {
    setActiveCat(cat);
    if (Math.random() < 0.3) {
      showBubble(pick(POKE_REACTIONS));
      sfx.boing();
      setShake((s) => s + 1);
    } else sfx.click();
    if (window.matchMedia('(max-width: 980px)').matches) catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Mouth flapping while talking.
  useEffect(() => {
    if (!bubble || !stopRef.current) return;
    const id = window.setInterval(() => {
      if (!stopRef.current) return setTalk(0);
      setTalk((t) => (t > 0.4 ? Math.random() * 0.3 : 0.6 + Math.random() * 0.4));
    }, 110);
    return () => window.clearInterval(id);
  }, [bubble]);

  const say = (text: string) => {
    const t = text.trim();
    if (!t) return;
    stopRef.current?.();
    const hat = HATS.find((h) => h.id === c.hat);
    const spoken = hat?.muffles ? muffle(t) : t;
    window.clearTimeout(bubbleTimer.current);
    setBubble(spoken);
    const preset = VOICES.find((v) => v.id === voice) ?? VOICES[0];
    stopRef.current = speak(spoken, preset, () => {
      stopRef.current = null;
      setTalk(0);
      bubbleTimer.current = window.setTimeout(() => setBubble(null), 900);
    });
    // kick the flapping effect (bubble may be unchanged if the same line is repeated)
    setTalk(0.8);
  };

  useEffect(() => () => stopRef.current?.(), []);

  const toot = () => {
    sfx.fart();
    setShake((s) => s + 1);
    showBubble(pick(['Excuse me!', 'Wasn\'t me.', 'Better out than in!', 'Smell ya later!', 'That was the dog.', 'Whoops. Teehee.']), 1600);
  };

  // Keyboard: arrows cycle items, R randomizes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.modal-backdrop')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const def = CATEGORIES[activeCat];
        const items = def.items;
        const idx = Math.max(0, items.findIndex((i) => isSelected(c, activeCat, i.id)));
        const next = items[(idx + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
        pickItem(activeCat, next.id);
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        randomizeAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeCat, c, pickItem, randomizeAll]);

  const bob = talk > 0.5 ? -5 : 0;

  return (
    <main className="creator">
      <div className="stage-col">
        <div className="panel stage-panel">
          <div className="stage">
            <svg className="stage-svg" viewBox={STAGE_VIEWBOX} aria-label={`${c.name}, your character. Click a body part to change it.`} role="img">
              <StageBackdrop />
              <g key={`s${shake}`} className={shake ? 'char-wrap shake' : 'char-wrap'}>
                <g key={`p${popKey}`} className={popKey ? 'char-wrap pop' : 'char-wrap'} style={{ transformOrigin: '200px 480px', transformBox: 'view-box' }}>
                  <g transform={`translate(0 ${bob})`}>
                    <CharacterGroup c={c} talk={talk} onPartClick={onPartClick} />
                  </g>
                </g>
              </g>
            </svg>
            {bubble && <div className="bubble">{bubble}</div>}
            <div className="stage-tools">
              <button className="icon-btn" onClick={randomizeAll} title="Randomize everything (R)" aria-label="Randomize everything">
                🎲
              </button>
              <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
                ↩️
              </button>
              <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
                ↪️
              </button>
              <button className="icon-btn" onClick={toot} title="Pull my finger" aria-label="Pull my finger">
                💨
              </button>
            </div>
            <div className="stage-hint">👆 Tap any part to change it<span className="desk-only"> · ← → flips through items</span></div>
          </div>
        </div>

        <div className="panel tools-panel">
          <div className="name-row">
            <label className="sr-only" htmlFor="char-name">
              Character name
            </label>
            <input
              id="char-name"
              className="name-input"
              value={c.name}
              maxLength={28}
              onChange={(e) => set((p) => ({ ...p, name: e.target.value }), 'name')}
              placeholder="Name your weirdo"
            />
            <button className="btn small" onClick={() => set((p) => ({ ...p, name: randomName() }))} title="Random name">
              🎲 Name
            </button>
          </div>
          <div className="toolbar">
            <button className="btn red" onClick={onSave}>
              💾 Save to Crew
            </button>
            <button className="btn yellow" onClick={onCard}>
              🪪 ID Card
            </button>
            <button className="btn blue" onClick={onBooth}>
              📸 Photo Booth
            </button>
            <button className="btn pink" onClick={onPhoto}>
              🤳 Photo → Me
            </button>
            <button className="btn" onClick={onShare}>
              🔗 Share
            </button>
          </div>
          <form
            className="talk-box"
            onSubmit={(e) => {
              e.preventDefault();
              say(line);
            }}
          >
            <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Make them say something…" maxLength={160} aria-label="Something for your character to say" />
            <select value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="Voice">
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <button className="btn green small" type="submit">
              🗣️ Say it
            </button>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                const l = pick(TALK_SUGGESTIONS);
                setLine(l);
                say(l);
              }}
            >
              🎲 Line
            </button>
          </form>
        </div>
      </div>

      <div ref={catalogRef} className="catalog-wrap">
        <Catalog
          c={c}
          activeCat={activeCat}
          onCat={(cat) => {
            setActiveCat(cat);
            sfx.click();
          }}
          onPick={pickItem}
          onColor={(field, color) => {
            set((p) => ({ ...p, [field]: color }), `color-${String(field)}`);
            sfx.click();
          }}
          onRandomCat={(cat) => {
            set((p) => randomizeCategory(p, cat));
            bump();
            sfx.whoosh();
          }}
          onSignText={(text) => set((p) => ({ ...p, signText: text.toUpperCase() }), 'sign')}
          onTogglePhotoFace={() => {
            set((p) => ({ ...p, usePhotoFace: !p.usePhotoFace }));
            bump();
          }}
        />
      </div>
    </main>
  );
}
