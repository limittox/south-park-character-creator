import { useEffect } from 'react';
import { news, useHeadline, useToasts } from '../lib/toast';
import { IDLE_HEADLINES } from '../data/humor';
import { pick } from '../lib/random';

export function LogoMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="56" rx="46" ry="40" fill="#fcd9b8" stroke="#1d1d1d" strokeWidth="4" />
      <ellipse cx="39" cy="55" rx="11" ry="15" fill="#fff" stroke="#1d1d1d" strokeWidth="3" transform="rotate(12 39 55)" />
      <ellipse cx="61" cy="55" rx="11" ry="15" fill="#fff" stroke="#1d1d1d" strokeWidth="3" transform="rotate(-12 61 55)" />
      <circle cx="45" cy="56" r="2.6" fill="#1d1d1d" />
      <circle cx="55" cy="56" r="2.6" fill="#1d1d1d" />
      <path d="M43 78 Q50 83 57 78" fill="none" stroke="#1d1d1d" strokeWidth="3" strokeLinecap="round" />
      <path d="M4 46 C6 8 94 8 96 46 Z" fill="#3b6fd8" stroke="#1d1d1d" strokeWidth="4" />
      <rect x="2" y="37" width="96" height="13" rx="6.5" fill="#d33b2c" stroke="#1d1d1d" strokeWidth="3" />
      <circle cx="50" cy="10" r="8" fill="#d33b2c" stroke="#1d1d1d" strokeWidth="3" />
    </svg>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function NewsTicker() {
  const headline = useHeadline();
  useEffect(() => {
    if (!headline) news(pick(IDLE_HEADLINES));
    const id = window.setInterval(() => news(pick(IDLE_HEADLINES)), 22000);
    return () => window.clearInterval(id);
  }, [headline]);
  return (
    <div className="ticker" aria-live="off">
      <div className="tag">TOWN NEWS</div>
      <div className="msg">
        <span key={headline}>{headline}</span>
      </div>
    </div>
  );
}
