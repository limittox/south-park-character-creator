import { useRef, useState } from 'react';
import type { CharacterState } from '../types';
import type { CrewMember } from '../lib/storage';
import { CharacterSvg } from '../character/Character';
import { normalizeCharacter } from '../data/defaults';
import { newId } from '../lib/storage';
import { toast } from '../lib/toast';
import { sfx } from '../lib/sound';

interface Props {
  crew: CrewMember[];
  setCrew: (next: CrewMember[]) => void;
  onEdit: (c: CharacterState) => void;
  onGroupPhoto: (cast: CharacterState[]) => void;
  onCreate: () => void;
}

export function CrewView({ crew, setCrew, onEdit, onGroupPhoto, onCreate }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const remove = (m: CrewMember) => {
    if (!window.confirm(`Kick ${m.c.name || 'this one'} out of the crew? They will be sad. (Not really, they are paper.)`)) return;
    setCrew(crew.filter((x) => x.id !== m.id));
    setPicked((p) => {
      const n = new Set(p);
      n.delete(m.id);
      return n;
    });
    sfx.sad();
  };

  const duplicate = (m: CrewMember) => {
    const copy = { id: newId(), savedAt: Date.now(), c: { ...m.c, name: `${m.c.name} Jr.`.slice(0, 28) } };
    setCrew([copy, ...crew]);
    toast(`${copy.c.name} has been cloned. Science!`, 'good');
  };

  const exportCrew = () => {
    const blob = new Blob([JSON.stringify({ app: 'paper-town-creator', version: 1, crew: crew.map((m) => m.c) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-paper-crew.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const importCrew = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.crew) ? data.crew : [];
      if (!list.length) throw new Error('No characters in that file.');
      const added = list.slice(0, 60).map((c) => ({ id: newId(), savedAt: Date.now(), c: normalizeCharacter(c as Partial<CharacterState>) }));
      setCrew([...added, ...crew]);
      toast(`Imported ${added.length} weirdo${added.length === 1 ? '' : 's'}!`, 'good');
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`, 'bad');
    }
  };

  const pickedChars = crew.filter((m) => picked.has(m.id)).map((m) => m.c);

  return (
    <main className="crew">
      <div className="panel crew-head">
        <h2>🧑‍🤝‍🧑 My Crew ({crew.length})</h2>
        <button className="btn blue" disabled={!pickedChars.length} onClick={() => onGroupPhoto(pickedChars)}>
          📸 Group photo{pickedChars.length ? ` (${pickedChars.length})` : ''}
        </button>
        <button className="btn small" onClick={() => setPicked(picked.size === crew.length ? new Set() : new Set(crew.map((m) => m.id)))} disabled={!crew.length}>
          {picked.size === crew.length && crew.length ? 'Select none' : 'Select all'}
        </button>
        <button className="btn small" onClick={exportCrew} disabled={!crew.length}>
          ⬇️ Export
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          ⬆️ Import
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importCrew(e.target.files?.[0])} />
      </div>

      {!crew.length ? (
        <div className="panel empty">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="40" fill="#fff" stroke="#1d1d1d" strokeWidth="4" />
            <circle cx="38" cy="44" r="5" fill="#1d1d1d" />
            <circle cx="62" cy="44" r="5" fill="#1d1d1d" />
            <path d="M35 70 Q50 58 65 70" fill="none" stroke="#1d1d1d" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p>No crew yet. Friendless. Tragic.</p>
          <p style={{ fontSize: 15, fontWeight: 700 }}>Make a character and hit “Save to Crew”. Then pick a few for a group photo.</p>
          <button className="btn red big" onClick={onCreate}>
            ✂️ Make someone
          </button>
        </div>
      ) : (
        <div className="crew-grid">
          {crew.map((m) => (
            <article key={m.id} className="panel crew-card">
              <div className="portrait">
                <CharacterSvg c={m.c} viewBox="-30 -60 460 560" />
                <input className="pick" type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Pick ${m.c.name} for a group photo`} />
              </div>
              <h3 title={m.c.name}>{m.c.name || 'Nobody'}</h3>
              <div className="row">
                <button className="btn small yellow" onClick={() => onEdit(m.c)}>
                  ✏️ Edit
                </button>
                <button className="btn small" onClick={() => duplicate(m)} aria-label={`Clone ${m.c.name}`}>
                  🧬
                </button>
                <button className="btn small" onClick={() => remove(m)} aria-label={`Delete ${m.c.name}`}>
                  🗑️
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
