import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterState } from '../types';
import { CharacterGroup, CharacterSvg } from '../character/Character';
import { getGeo } from '../character/geometry';
import { getScene, SCENES, SCENE_H, SCENE_W, WEATHERS, WeatherLayer, type Weather } from '../scenes/backgrounds';
import { CLOTH_COLORS } from '../data/palette';
import { CHEESE_LINES } from '../data/humor';
import { MOODS } from '../character/parts/face';
import { newId, type CrewMember } from '../lib/storage';
import { randomCharacter, pick } from '../lib/random';
import { applyItem } from '../lib/apply';
import { downloadBlob, safeFileName, shareBlob, svgToBlob } from '../lib/exportImage';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';
import { Modal } from './Modal';
import { wrapText } from './CharacterCard';

interface Actor {
  key: string;
  c: CharacterState;
  x: number;
  y: number;
  s: number;
  flip: boolean;
  bubble: string;
}

type Frame = 'none' | 'polaroid' | 'news';

const FRAMES: { id: Frame; label: string }[] = [
  { id: 'none', label: 'Just the photo' },
  { id: 'polaroid', label: 'Instant photo' },
  { id: 'news', label: 'Front page news' },
];

const DISPLAY = "'Luckiest Guy', 'Arial Black', Impact, sans-serif";
const QUICK_MOODS = ['happy', 'joy', 'angry', 'shock', 'sad', 'evil', 'love'];

const makeActor = (c: CharacterState, i: number, n: number, groundY: number): Actor => ({
  key: newId(),
  c,
  x: n === 1 ? SCENE_W / 2 : 260 + (i * (SCENE_W - 520)) / Math.max(1, n - 1),
  y: groundY,
  s: n === 1 ? 1.15 : n > 4 ? 0.8 : 1,
  flip: false,
  bubble: '',
});

interface Props {
  current: CharacterState;
  crew: CrewMember[];
  initialCast: CharacterState[] | null;
}

function Bubble({ actor }: { actor: Actor }) {
  const g = getGeo(actor.c.body, actor.c.headShape);
  const lines = wrapText(actor.bubble, 18).slice(0, 4);
  const fs = 36;
  const w = Math.max(...lines.map((l) => l.length)) * 20 + 50;
  const h = lines.length * 42 + 32;
  const headTop = actor.y + (g.headCy - g.headRy - 70 - 480) * actor.s;
  const bx = Math.min(SCENE_W - w / 2 - 10, Math.max(w / 2 + 10, actor.x + 40));
  const by = Math.max(h + 10, headTop - 20);
  const tipX = actor.x + 10;
  const tipY = Math.min(headTop + 40, by + 60);
  return (
    <g pointerEvents="none">
      <path d={`M ${bx - 26} ${by - 4} L ${tipX} ${tipY} L ${bx + 10} ${by - 4} Z`} fill="#fff" stroke="#1d1d1d" strokeWidth={4} strokeLinejoin="round" />
      <rect x={bx - w / 2} y={by - h} width={w} height={h} rx={28} fill="#fff" stroke="#1d1d1d" strokeWidth={4} />
      <path d={`M ${bx - 24} ${by - 2} L ${bx + 8} ${by - 2}`} stroke="#fff" strokeWidth={6} />
      {lines.map((l, i) => (
        <text key={i} x={bx} y={by - h + 52 + i * 42} textAnchor="middle" fontFamily={DISPLAY} fontSize={fs} fill="#1d1d1d">
          {l}
        </text>
      ))}
    </g>
  );
}

export function PhotoBooth({ current, crew, initialCast }: Props) {
  const [sceneId, setSceneId] = useState('busstop');
  const scene = getScene(sceneId);
  const [actors, setActors] = useState<Actor[]>(() => {
    const cast = initialCast?.length ? initialCast : [current];
    return cast.map((c, i) => makeActor(c, i, cast.length, getScene('busstop').groundY));
  });
  const [sel, setSel] = useState<string | null>(actors[0]?.key ?? null);
  const [townName, setTownName] = useState('Snowpine Hollow');
  const [studioColor, setStudioColor] = useState('#5aaeea');
  const [weather, setWeather] = useState<Weather>('none');
  const [frame, setFrame] = useState<Frame>('none');
  const [caption, setCaption] = useState('');
  const [headline, setHeadline] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [cheese, setCheese] = useState('');
  const [flash, setFlash] = useState(false);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sceneRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ key: string; dx: number; dy: number } | null>(null);

  const selected = actors.find((a) => a.key === sel) ?? null;
  const update = (key: string, patch: Partial<Actor>) => setActors((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );

  const toScene = (e: React.PointerEvent) => {
    const svg = sceneRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const onActorDown = (a: Actor) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toScene(e);
    dragRef.current = { key: a.key, dx: a.x - p.x, dy: a.y - p.y };
    setSel(a.key);
    setActors((list) => [...list.filter((x) => x.key !== a.key), a]);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toScene(e);
    update(d.key, { x: Math.round(p.x + d.dx), y: Math.round(Math.min(SCENE_H + 200, Math.max(200, p.y + d.dy))) });
  };
  const onUp = () => {
    dragRef.current = null;
  };

  // Delete removes the selected actor, arrows nudge it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel || (e.target as HTMLElement).closest('input, textarea, select') || document.querySelector('.modal-backdrop')) return;
      const step = e.shiftKey ? 40 : 10;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setActors((list) => list.filter((a) => a.key !== sel));
        setSel(null);
        e.preventDefault();
      } else if (moves[e.key]) {
        const [dx, dy] = moves[e.key];
        setActors((list) => list.map((a) => (a.key === sel ? { ...a, x: a.x + dx, y: a.y + dy } : a)));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const addActor = (c: CharacterState) => {
    // Drop newcomers wherever there is the most elbow room.
    let bestX = SCENE_W / 2;
    let bestGap = -1;
    for (let x = 220; x <= SCENE_W - 220; x += 60) {
      const gap = Math.min(...actors.map((o) => Math.abs(o.x - x)), Infinity);
      if (gap > bestGap) {
        bestGap = gap;
        bestX = x;
      }
    }
    const a = { ...makeActor(c, 0, 1, scene.groundY), x: bestX, s: actors.length > 3 ? 0.85 : 1 };
    setActors((list) => [...list, a]);
    setSel(a.key);
    sfx.pop();
  };

  const layout = useMemo(() => {
    if (frame === 'polaroid') return { w: 1720, h: 1360, sx: 60, sy: 60 };
    if (frame === 'news') return { w: 1720, h: 1560, sx: 60, sy: 380 };
    return { w: SCENE_W, h: SCENE_H, sx: 0, sy: 0 };
  }, [frame]);

  const snap = async () => {
    if (count !== null) return;
    setSel(null);
    setCheese(pick(CHEESE_LINES));
    for (const n of [3, 2, 1]) {
      setCount(n);
      sfx.click();
      await new Promise((r) => setTimeout(r, 750));
    }
    setCount(null);
    sfx.shutter();
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!svgRef.current) return;
    try {
      const blob = await svgToBlob(svgRef.current, { width: layout.w, height: layout.h, background: '#ffffff', quality: 0.93 });
      setShot({ url: URL.createObjectURL(blob), blob });
    } catch (e) {
      toast(`The camera jammed: ${(e as Error).message}`, 'bad');
    }
  };

  const fileName = `${safeFileName(actors.map((a) => a.c.name.split(' ')[0]).slice(0, 3).join('-') || 'photo')}-${sceneId}.jpg`;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const autoHeadline = headline.trim() || `LOCAL ${actors.length > 1 ? 'KIDS' : (actors[0]?.c.name.split(' ')[0] || 'KID').toUpperCase()} DO${actors.length > 1 ? '' : 'ES'} SOMETHING`;

  const sceneContent = (
    <svg ref={sceneRef} x={layout.sx} y={layout.sy} width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} overflow="hidden">
      <g onPointerDown={() => setSel(null)}>{scene.render({ townName, studioColor })}</g>
      {actors.map((a) => (
        <g
          key={a.key}
          className="actor"
          transform={`translate(${a.x} ${a.y}) scale(${a.flip ? -a.s : a.s} ${a.s}) translate(-200 -480)`}
          onPointerDown={onActorDown(a)}
        >
          {a.key === sel && <ellipse data-export-ignore cx={200} cy={484} rx={120} ry={16} fill="#ffe14d" opacity={0.8} stroke="#1d1d1d" strokeWidth={3} strokeDasharray="10 6" />}
          <CharacterGroup c={a.c} />
        </g>
      ))}
      {weather !== 'none' && (
        <g className={weather === 'snow' ? 'snow-anim' : undefined}>
          <WeatherLayer weather={weather} />
          <g transform="translate(0 -1000)">
            <WeatherLayer weather={weather} />
          </g>
        </g>
      )}
      {actors.filter((a) => a.bubble.trim()).map((a) => (
        <Bubble key={a.key} actor={a} />
      ))}
      {frame === 'none' && caption.trim() && (
        <g>
          <rect x={0} y={SCENE_H - 120} width={SCENE_W} height={120} fill="#1d1d1d" opacity={0.78} />
          <text x={SCENE_W / 2} y={SCENE_H - 42} textAnchor="middle" fontFamily={DISPLAY} fontSize={58} fill="#fff">
            {caption.slice(0, 48)}
          </text>
        </g>
      )}
    </svg>
  );

  return (
    <main className="booth">
      <div className="panel booth-stage">
        <svg
          ref={svgRef}
          className="scene"
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          xmlns="http://www.w3.org/2000/svg"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label={`Photo booth: ${scene.name}`}
        >
          {frame === 'polaroid' && <rect x={0} y={0} width={layout.w} height={layout.h} fill="#fdfcf7" />}
          {frame === 'news' && (
            <g>
              <rect x={0} y={0} width={layout.w} height={layout.h} fill="#f1ead8" />
              <text x={layout.w / 2} y={130} textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize={112} fill="#1d1d1d">
                The Paper Town Times
              </text>
              <path d={`M 60 160 L ${layout.w - 60} 160 M 60 222 L ${layout.w - 60} 222`} stroke="#1d1d1d" strokeWidth={4} />
              <text x={70} y={202} fontFamily="Georgia, serif" fontSize={30} fill="#1d1d1d">
                {today}
              </text>
              <text x={layout.w - 70} y={202} textAnchor="end" fontFamily="Georgia, serif" fontSize={30} fill="#1d1d1d">
                Price: one (1) cookie
              </text>
              <text x={layout.w / 2} y={330} textAnchor="middle" fontFamily={DISPLAY} fontSize={autoHeadline.length > 26 ? 72 : 96} fill="#1d1d1d">
                {autoHeadline.slice(0, 40).toUpperCase()}
              </text>
              {Array.from({ length: 3 }, (_, col) =>
                Array.from({ length: 4 }, (_, row) => (
                  <rect key={`${col}-${row}`} x={60 + col * 540} y={1420 + row * 30} width={col === 2 && row === 3 ? 300 : 500} height={12} rx={4} fill="#a59c86" />
                )),
              )}
            </g>
          )}
          {sceneContent}
          {frame !== 'none' && <rect x={layout.sx} y={layout.sy} width={SCENE_W} height={SCENE_H} fill="none" stroke="#1d1d1d" strokeWidth={frame === 'news' ? 6 : 3} />}
          {frame === 'polaroid' && (
            <text x={layout.w / 2} y={1250} textAnchor="middle" fontFamily="'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive" fontSize={78} fill="#2a2a6a">
              {(caption.trim() || `${scene.name} · ${new Date().getFullYear()}`).slice(0, 40)}
            </text>
          )}
        </svg>
        {count !== null && (
          <div className="countdown" key={count}>
            <div>
              {count}
              <small>{cheese}</small>
            </div>
          </div>
        )}
        <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>👆 Drag characters around. Click one to edit it.</span>
          <button className="btn red big" onClick={snap} disabled={count !== null || !actors.length}>
            📸 Snap Photo
          </button>
        </div>
      </div>

      <aside className="booth-side">
        <section className="panel">
          <h3 className="side-title">🏔️ Pick a place</h3>
          <div className="scene-grid">
            {SCENES.map((s) => (
              <button
                key={s.id}
                className="scene-btn"
                aria-pressed={s.id === sceneId}
                title={s.quip}
                onClick={() => {
                  setSceneId(s.id);
                  setActors((list) => list.map((a) => ({ ...a, y: a.y === scene.groundY ? s.groundY : a.y })));
                  sfx.pop();
                }}
              >
                <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>{s.render({ townName, studioColor })}</svg>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: '8px 0 0', color: '#5d5a52' }}>{scene.quip}</p>
          {sceneId === 'townsign' && (
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="town">Town name</label>
              <input id="town" type="text" value={townName} maxLength={18} onChange={(e) => setTownName(e.target.value)} />
            </div>
          )}
          {sceneId === 'studio' && (
            <div className="palette" style={{ padding: '10px 0 0' }}>
              {CLOTH_COLORS.map((col) => (
                <button key={col} className="swatch" style={{ background: col }} aria-label={`Backdrop ${col}`} aria-pressed={studioColor === col} onClick={() => setStudioColor(col)} />
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3 className="side-title">🎭 The cast</h3>
          <div className="cast-list">
            {actors.map((a) => (
              <div key={a.key} className={`cast-row${a.key === sel ? ' sel' : ''}`}>
                <CharacterSvg c={a.c} viewBox={`${getGeo(a.c.body, a.c.headShape).headCx - 150} ${getGeo(a.c.body, a.c.headShape).headCy - 150} 300 300`} />
                <button className="nm" onClick={() => setSel(a.key)}>
                  {a.c.name || 'Nobody'}
                </button>
                <button className="btn small" onClick={() => setActors((l) => l.filter((x) => x.key !== a.key))} aria-label={`Remove ${a.c.name}`}>
                  ✕
                </button>
              </div>
            ))}
            {!actors.length && <p style={{ fontWeight: 800, margin: 0 }}>Nobody here. Spooky.</p>}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small blue" onClick={() => addActor(current)}>
              + Me
            </button>
            <button className="btn small" onClick={() => addActor(randomCharacter())}>
              + Random weirdo
            </button>
          </div>
          {crew.length > 0 && (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label htmlFor="add-crew">Add from your crew</label>
              <select
                id="add-crew"
                value=""
                onChange={(e) => {
                  const m = crew.find((x) => x.id === e.target.value);
                  if (m) addActor(m.c);
                }}
              >
                <option value="">Choose a crew member…</option>
                {crew.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.c.name || 'Nobody'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {selected && (
          <section className="panel">
            <h3 className="side-title">✏️ {selected.c.name || 'This one'}</h3>
            <div className="field">
              <label htmlFor="bubble">Speech bubble</label>
              <input id="bubble" type="text" value={selected.bubble} maxLength={70} placeholder="Say something dumb…" onChange={(e) => update(selected.key, { bubble: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="size">Size</label>
              <input id="size" type="range" min={0.4} max={1.7} step={0.05} value={selected.s} onChange={(e) => update(selected.key, { s: Number(e.target.value) })} />
            </div>
            <div className="field">
              <span className="lbl">Mood</span>
              <div className="chips">
                {QUICK_MOODS.map((id) => {
                  const m = MOODS.find((x) => x.id === id)!;
                  return (
                    <button key={id} className="chip-btn" onClick={() => update(selected.key, { c: applyItem(selected.c, 'mood', id) })}>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="row">
              <button className="btn small" onClick={() => update(selected.key, { flip: !selected.flip })}>
                ↔️ Flip
              </button>
              <button className="btn small" onClick={() => setActors((l) => [...l.filter((x) => x.key !== selected.key), selected])}>
                ⬆️ Front
              </button>
              <button className="btn small" onClick={() => setActors((l) => [selected, ...l.filter((x) => x.key !== selected.key)])}>
                ⬇️ Back
              </button>
            </div>
          </section>
        )}

        <section className="panel">
          <h3 className="side-title">🎞️ Extras</h3>
          <div className="field">
            <label htmlFor="weather">Weather</label>
            <select id="weather" value={weather} onChange={(e) => setWeather(e.target.value as Weather)}>
              {WEATHERS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="frame">Frame</label>
            <select id="frame" value={frame} onChange={(e) => setFrame(e.target.value as Frame)}>
              {FRAMES.map((fr) => (
                <option key={fr.id} value={fr.id}>
                  {fr.label}
                </option>
              ))}
            </select>
          </div>
          {frame === 'news' ? (
            <div className="field">
              <label htmlFor="headline">Headline</label>
              <input id="headline" type="text" value={headline} maxLength={40} placeholder={autoHeadline} onChange={(e) => setHeadline(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="caption">Caption</label>
              <input id="caption" type="text" value={caption} maxLength={48} placeholder="Best day ever (it was not)" onChange={(e) => setCaption(e.target.value)} />
            </div>
          )}
        </section>
      </aside>

      {flash && <div className="flash" />}

      {shot && (
        <Modal title="Nice shot!" icon="📸" onClose={() => setShot(null)}>
          <div className="snap-preview">
            <img src={shot.url} alt="Your photo booth picture" />
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn red big"
              onClick={() => {
                downloadBlob(shot.blob, fileName);
                sfx.ding();
                toast('Saved! Frame it. Put it on the fridge. Show your grandma.', 'good');
              }}
            >
              ⬇️ Save JPEG
            </button>
            {'share' in navigator && (
              <button className="btn blue" onClick={() => void shareBlob(shot.blob, fileName, 'Look what I made!').then((ok) => !ok && toast('Sharing is not supported here. Save it instead!'))}>
                📤 Share
              </button>
            )}
            <button className="btn" onClick={() => setShot(null)}>
              🔁 Retake
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
