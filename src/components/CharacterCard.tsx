import { useMemo, useRef, useState } from 'react';
import type { CharacterState } from '../types';
import { CharacterGroup } from '../character/Character';
import { charFrame, getGeo, GROUND_Y } from '../character/geometry';
import { Modal } from './Modal';
import { DISLIKES, KNOWN_FOR, LIKES, STAT_NAMES, TITLES } from '../data/humor';
import { seeded } from '../character/parts/common';
import { downloadBlob, safeFileName, shareBlob, svgToBlob } from '../lib/exportImage';
import { toast } from '../lib/toast';
import { sfx } from '../lib/sound';

const DISPLAY = "'Luckiest Guy', 'Arial Black', Impact, sans-serif";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Greedy word wrap for SVG text (no foreignObject: it would taint the export canvas). */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface Profile {
  title: string;
  knownFor: string;
  likes: string[];
  dislikes: string[];
  stats: { name: string; value: number }[];
  idNo: string;
}

/** Same character + same reroll = same profile, so the card is stable. */
export function makeProfile(c: CharacterState, reroll: number): Profile {
  const rnd = seeded(hash(JSON.stringify({ ...c, photoFace: null })) + reroll * 7919);
  const pickN = (list: string[], n: number) => {
    const copy = [...list];
    const out: string[] = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
    return out;
  };
  return {
    title: TITLES[Math.floor(rnd() * TITLES.length)],
    knownFor: KNOWN_FOR[Math.floor(rnd() * KNOWN_FOR.length)],
    likes: pickN(LIKES, 3),
    dislikes: pickN(DISLIKES, 3),
    stats: STAT_NAMES.map((name) => ({ name, value: 1 + Math.floor(rnd() * 10) })),
    idNo: String(Math.floor(rnd() * 900000) + 100000),
  };
}

export function CardSvg({ c, profile, svgRef }: { c: CharacterState; profile: Profile; svgRef?: React.Ref<SVGSVGElement> }) {
  const name = c.name.trim() || 'Nobody Special';
  // Portrait slot is 420×500; frame the whole character at that aspect.
  const f = charFrame(getGeo(c.body, c.headShape));
  const pw = f.h * 0.84;
  return (
    <svg ref={svgRef} className="id-card" viewBox="0 0 1000 1400" xmlns="http://www.w3.org/2000/svg">
      <rect x={10} y={10} width={980} height={1380} rx={40} fill="#fffdf6" stroke="#1d1d1d" strokeWidth={8} />
      <path d="M 10 50 Q 10 10 50 10 L 950 10 Q 990 10 990 50 L 990 170 L 10 170 Z" fill="#d33b2c" stroke="#1d1d1d" strokeWidth={8} />
      <text x={500} y={88} textAnchor="middle" fontFamily={DISPLAY} fontSize={58} fill="#fff" stroke="#1d1d1d" strokeWidth={3}>
        OFFICIAL TOWN ID
      </text>
      <text x={500} y={140} textAnchor="middle" fontFamily={DISPLAY} fontSize={28} fill="#f2c230">
        A QUIET LITTLE PAPER TOWN · NO. {profile.idNo}
      </text>
      <rect x={60} y={210} width={420} height={500} rx={24} fill="#bfe6ff" stroke="#1d1d1d" strokeWidth={6} />
      <svg x={60} y={210} width={420} height={500} viewBox={`${f.x + f.w / 2 - pw / 2} ${f.y} ${pw} ${f.h}`}>
        <rect x={f.x - 200} y={GROUND_Y - 36} width={f.w + 400} height={200} fill="#f4f8ff" />
        <CharacterGroup c={c} />
      </svg>
      <text x={520} y={262} fontFamily={DISPLAY} fontSize={26} fill="#5d5a52">
        NAME
      </text>
      <text x={520} y={322} fontFamily={DISPLAY} fontSize={name.length > 16 ? 40 : 54} fill="#1d1d1d">
        {name.slice(0, 26)}
      </text>
      <text x={520} y={382} fontFamily={DISPLAY} fontSize={26} fill="#5d5a52">
        TITLE
      </text>
      {wrapText(profile.title, 20).slice(0, 3).map((l, i) => (
        <text key={i} x={520} y={432 + i * 40} fontFamily={DISPLAY} fontSize={36} fill="#3b6fd8">
          {l}
        </text>
      ))}
      <text x={520} y={562} fontFamily={DISPLAY} fontSize={26} fill="#5d5a52">
        KNOWN FOR
      </text>
      {wrapText(profile.knownFor, 28).slice(0, 4).map((l, i) => (
        <text key={i} x={520} y={608 + i * 32} fontFamily="Nunito, Arial, sans-serif" fontWeight={800} fontSize={25} fill="#1d1d1d">
          {l}
        </text>
      ))}
      <text x={60} y={780} fontFamily={DISPLAY} fontSize={34} fill="#1d1d1d">
        STATS
      </text>
      {profile.stats.map((s, i) => (
        <g key={s.name} transform={`translate(60 ${806 + i * 62})`}>
          <text x={0} y={34} fontFamily={DISPLAY} fontSize={28} fill="#1d1d1d">
            {s.name}
          </text>
          <rect x={330} y={8} width={560} height={34} rx={17} fill="#fff" stroke="#1d1d1d" strokeWidth={4} />
          <rect x={333} y={11} width={(554 * s.value) / 10} height={28} rx={14} fill={['#d33b2c', '#f0742a', '#7fbf3f', '#8b5cc7', '#3b6fd8', '#e86fb0'][i % 6]} />
          <text x={900} y={36} fontFamily={DISPLAY} fontSize={26} fill="#1d1d1d" textAnchor="start">
            {s.value}
          </text>
        </g>
      ))}
      <text x={60} y={1214} fontFamily={DISPLAY} fontSize={30} fill="#2e8b47">
        LIKES
      </text>
      <text x={520} y={1214} fontFamily={DISPLAY} fontSize={30} fill="#d33b2c">
        DISLIKES
      </text>
      {profile.likes.map((l, i) => (
        <text key={l} x={60} y={1258 + i * 36} fontFamily="Nunito, Arial, sans-serif" fontWeight={800} fontSize={27} fill="#1d1d1d">
          ✓ {l}
        </text>
      ))}
      {profile.dislikes.map((l, i) => (
        <text key={l} x={520} y={1258 + i * 36} fontFamily="Nunito, Arial, sans-serif" fontWeight={800} fontSize={27} fill="#1d1d1d">
          ✗ {l}
        </text>
      ))}
      <g transform="translate(-480 -500) rotate(-12 820 1130)" opacity={0.85}>
        <rect x={660} y={1086} width={320} height={92} rx={14} fill="none" stroke="#d33b2c" strokeWidth={7} />
        <text x={820} y={1148} textAnchor="middle" fontFamily={DISPLAY} fontSize={50} fill="#d33b2c">
          APPROVED*
        </text>
        <text x={820} y={1206} textAnchor="middle" fontFamily={DISPLAY} fontSize={22} fill="#d33b2c">
          *MOSTLY
        </text>
      </g>
    </svg>
  );
}

export function CharacterCard({ c, onClose }: { c: CharacterState; onClose: () => void }) {
  const [reroll, setReroll] = useState(0);
  const profile = useMemo(() => makeProfile(c, reroll), [c, reroll]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async (share: boolean) => {
    if (!svgRef.current) return;
    setBusy(true);
    try {
      const blob = await svgToBlob(svgRef.current, { width: 1000, height: 1400, background: '#7ec8ff' });
      const file = `${safeFileName(c.name)}-town-id.jpg`;
      if (share && (await shareBlob(blob, file, `Meet ${c.name}!`))) return;
      downloadBlob(blob, file);
      sfx.ding();
      toast('ID card saved. Do not lose it. Replacement fee: one cookie.', 'good');
    } catch (e) {
      toast(`Could not save the card: ${(e as Error).message}`, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Official Town ID" icon="🪪" onClose={onClose}>
      <div className="card-wrap">
        <CardSvg c={c} profile={profile} svgRef={svgRef} />
        <div>
          <p style={{ fontWeight: 800, marginTop: 0 }}>
            Every resident gets an official ID. Stats are calculated by a highly scientific process (a hamster on a wheel).
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn yellow" onClick={() => setReroll((r) => r + 1)}>
              🎲 Reroll stats
            </button>
          </div>
          <div className="row">
            <button className="btn red" disabled={busy} onClick={() => save(false)}>
              ⬇️ Download JPEG
            </button>
            {'share' in navigator && (
              <button className="btn blue" disabled={busy} onClick={() => save(true)}>
                📤 Share
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
