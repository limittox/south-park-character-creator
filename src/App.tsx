import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { CharacterState } from './types';
import { CreatorView } from './components/CreatorView';
import { PhotoBooth } from './components/PhotoBooth';
import { CrewView } from './components/CrewView';
import { CharacterCard } from './components/CharacterCard';
import { ShareModal } from './components/ShareModal';
import { Intro } from './components/Intro';
import { HelpModal } from './components/HelpModal';
import { LogoMark, NewsTicker, Toasts } from './components/Chrome';
import { useHistory } from './lib/useHistory';
import { getPref, loadCrew, loadCurrent, newId, saveCrew, saveCurrent, setPref, type CrewMember } from './lib/storage';
import { characterFromHash } from './lib/share';
import { DEFAULT_CHARACTER } from './data/defaults';
import { isMuted, setMuted, sfx } from './lib/sound';
import { news, toast } from './lib/toast';
import { pick } from './lib/random';
import { SAVE_QUIPS } from './data/humor';

// The photo scanner is the heaviest part of the app; it loads when someone opens it.
const PhotoConverter = lazy(() => import('./components/PhotoConverter').then((m) => ({ default: m.PhotoConverter })));

type View = 'create' | 'booth' | 'crew';

function initialCharacter(): CharacterState {
  const shared = characterFromHash(location.hash);
  if (shared) {
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => toast('Someone sent you a character! Probably a weirdo.', 'good', 4200), 300);
    return shared;
  }
  return loadCurrent() ?? DEFAULT_CHARACTER;
}

export default function App() {
  const h = useHistory<CharacterState>(initialCharacter);
  const c = h.value;
  const [view, setView] = useState<View>('create');
  const [crew, setCrewState] = useState<CrewMember[]>(loadCrew);
  const [boothCast, setBoothCast] = useState<CharacterState[] | null>(null);
  const [modal, setModal] = useState<'photo' | 'card' | 'share' | 'help' | null>(null);
  const [intro, setIntro] = useState(() => !getPref('seenIntro', false));
  const [muted, setMutedState] = useState(isMuted());

  // Autosave the character being edited.
  useEffect(() => {
    const id = window.setTimeout(() => saveCurrent(c), 400);
    return () => window.clearTimeout(id);
  }, [c]);

  const setCrew = useCallback((next: CrewMember[]) => {
    setCrewState(next);
    if (!saveCrew(next)) toast('Storage is full! Some photo faces were not saved.', 'bad');
  }, []);

  // Undo / redo from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || view !== 'create') return;
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        h.undo();
        e.preventDefault();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        h.redo();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h, view]);

  const go = (v: View) => {
    if (v !== 'booth') setBoothCast(null);
    setView(v);
    sfx.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveToCrew = () => {
    const existing = crew.findIndex((m) => m.c.name === c.name);
    if (existing >= 0) {
      const next = [...crew];
      next[existing] = { ...next[existing], c, savedAt: Date.now() };
      setCrew(next);
      toast(`Updated ${c.name || 'them'} in your crew.`, 'good');
    } else {
      setCrew([{ id: newId(), savedAt: Date.now(), c }, ...crew]);
      toast(pick(SAVE_QUIPS), 'good');
    }
    news(`NEW RESIDENT: ${c.name || 'Someone'} has moved to town. Neighbours "cautiously optimistic".`);
    sfx.ding();
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    setMutedState(m);
    if (!m) sfx.pop();
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="logo" onClick={() => go('create')} aria-label="Paper Town Character Creator, home">
          <LogoMark />
          <span className="logo-text">
            Paper Town
            <small>CHARACTER CREATOR</small>
          </span>
        </button>
        <nav className="nav" aria-label="Main">
          <button className="nav-btn" aria-current={view === 'create' ? 'page' : undefined} onClick={() => go('create')}>
            ✂️ Create
          </button>
          <button className="nav-btn" onClick={() => setModal('photo')}>
            🤳 Photo → Me
          </button>
          <button className="nav-btn" aria-current={view === 'booth' ? 'page' : undefined} onClick={() => go('booth')}>
            📸 Photo Booth
          </button>
          <button className="nav-btn" aria-current={view === 'crew' ? 'page' : undefined} onClick={() => go('crew')}>
            🧑‍🤝‍🧑 Crew{crew.length ? ` (${crew.length})` : ''}
          </button>
        </nav>
        <button className="icon-btn" onClick={() => setModal('help')} aria-label="How this works" title="How this works">
          ❓
        </button>
        <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} title={muted ? 'Sound off' : 'Sound on'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      {view === 'create' && (
        <CreatorView
          c={c}
          set={h.set}
          undo={h.undo}
          redo={h.redo}
          canUndo={h.canUndo}
          canRedo={h.canRedo}
          onSave={saveToCrew}
          onCard={() => setModal('card')}
          onPhoto={() => setModal('photo')}
          onBooth={() => go('booth')}
          onShare={() => setModal('share')}
        />
      )}
      {view === 'booth' && <PhotoBooth key={boothCast ? 'cast' : 'solo'} current={c} crew={crew} initialCast={boothCast} />}
      {view === 'crew' && (
        <CrewView
          crew={crew}
          setCrew={setCrew}
          onCreate={() => go('create')}
          onEdit={(member) => {
            h.set(member);
            setView('create');
            toast(`Now editing ${member.name || 'them'}. Hit "Save to Crew" to keep changes.`);
          }}
          onGroupPhoto={(cast) => {
            setBoothCast(cast);
            setView('booth');
            sfx.pop();
          }}
        />
      )}

      {modal === 'photo' && (
        <Suspense fallback={null}>
          <PhotoConverter
            base={c}
            onClose={() => setModal(null)}
            onApply={(next) => {
              h.set(next);
              setModal(null);
              setView('create');
              toast("You've been paper-ified! Tweak anything you like.", 'good');
              news(`SHOCKING: Local resident turned into construction paper. "Honestly an improvement," says mom.`);
            }}
          />
        </Suspense>
      )}
      {modal === 'card' && <CharacterCard c={c} onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareModal c={c} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {intro && (
        <Intro
          onClose={() => {
            setIntro(false);
            setPref('seenIntro', true);
            sfx.pop();
          }}
        />
      )}
      <Toasts />
      <NewsTicker />
    </div>
  );
}
