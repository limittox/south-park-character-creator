import { useEffect } from 'react';
import { DISCLAIMER } from '../data/humor';

export function Intro({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Disclaimer">
      <div className="modal narrow">
        <div className="disclaimer">
          <h2>⚠️ WARNING ⚠️</h2>
          {DISCLAIMER.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <button className="btn yellow big" style={{ marginTop: 10 }} onClick={onClose} autoFocus>
            I'm old enough. Probably.
          </button>
        </div>
      </div>
    </div>
  );
}
