import type { ReactNode } from 'react';
import { ink, O, scallop, seeded, starPath } from '../character/parts/common';
import { shade } from '../lib/color';

export const SCENE_W = 1600;
export const SCENE_H = 1000;

export interface SceneOpts {
  townName: string;
  studioColor: string;
}

export interface SceneDef {
  id: string;
  name: string;
  quip: string;
  groundY: number;
  render: (o: SceneOpts) => ReactNode;
}

const DISPLAY = "'Luckiest Guy', 'Arial Black', Impact, sans-serif";
const f = (color: string) => ({ fill: color, ...ink });

/* ------------------------------------------------------------ helpers */

function sky(top: string, bottom: string, id: string) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={SCENE_W} height={SCENE_H} fill={`url(#${id})`} />
    </>
  );
}

function cloud(x: number, y: number, s = 1, color = '#ffffff') {
  return <path d={scallop(x, y, 90 * s, 34 * s, 9, 0.16)} {...f(color)} />;
}

function mountains(baseY: number, color = '#8b88c9') {
  const peaks: [number, number][] = [
    [-80, 330],
    [180, 220],
    [420, 300],
    [640, 180],
    [900, 290],
    [1120, 200],
    [1380, 280],
    [1640, 210],
  ];
  return (
    <g>
      {peaks.map(([x, y], i) => {
        const w = 300;
        return (
          <g key={i}>
            <path d={`M ${x - w} ${baseY} L ${x} ${y} L ${x + w} ${baseY} Z`} {...f(i % 2 ? shade(color, -0.08) : color)} />
            <path
              d={`M ${x - w * 0.28} ${y + (baseY - y) * 0.28} L ${x} ${y} L ${x + w * 0.28} ${y + (baseY - y) * 0.28} L ${x + w * 0.14} ${y + (baseY - y) * 0.22} L ${x} ${y + (baseY - y) * 0.32} L ${x - w * 0.14} ${y + (baseY - y) * 0.22} Z`}
              fill="#fff"
              {...ink}
              strokeWidth={2.5}
            />
          </g>
        );
      })}
    </g>
  );
}

function pine(x: number, y: number, s = 1, snow = true) {
  const tiers = [0, 1, 2];
  return (
    <g>
      <rect x={x - 8 * s} y={y - 20 * s} width={16 * s} height={22 * s} {...f('#6b4226')} strokeWidth={2} />
      {tiers.map((t) => {
        const ty = y - 20 * s - t * 46 * s;
        const w = (70 - t * 16) * s;
        return (
          <g key={t}>
            <path d={`M ${x - w} ${ty} L ${x} ${ty - 70 * s} L ${x + w} ${ty} Z`} {...f('#2f6b3a')} strokeWidth={2.5} />
            {snow && <path d={`M ${x - w * 0.35} ${ty - 45 * s} L ${x} ${ty - 70 * s} L ${x + w * 0.35} ${ty - 45 * s} Q ${x} ${ty - 38 * s} ${x - w * 0.35} ${ty - 45 * s} Z`} fill="#fff" />}
          </g>
        );
      })}
    </g>
  );
}

function snowGround(y: number, color = '#f4f8ff') {
  return (
    <g>
      <path d={`M 0 ${y} Q 400 ${y - 30} 800 ${y} T 1600 ${y} L 1600 1000 L 0 1000 Z`} {...f(color)} />
      <path d={`M 120 ${y + 60} q 60 -14 120 0 M 900 ${y + 90} q 80 -16 160 0 M 1300 ${y + 40} q 50 -10 100 0`} fill="none" stroke="#c9dcf2" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

function sign(x: number, y: number, w: number, h: number, lines: string[], bg = '#fff', fg = '#1d1d1d', size = 34) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={6} {...f(bg)} />
      {lines.map((l, i) => (
        <text key={i} x={x} y={y + (i - (lines.length - 1) / 2) * size * 1.1 + size * 0.36} textAnchor="middle" fontFamily={DISPLAY} fontSize={size} fill={fg}>
          {l}
        </text>
      ))}
    </g>
  );
}

function windowPane(x: number, y: number, w: number, h: number, glass = '#bfe6ff') {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} {...f(glass)} />
      <path d={`M ${x + w / 2} ${y} L ${x + w / 2} ${y + h} M ${x} ${y + h / 2} L ${x + w} ${y + h / 2}`} stroke={O} strokeWidth={3} />
      <path d={`M ${x + 8} ${y + h / 2 - 10} L ${x + w / 2 - 12} ${y + 10}`} stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.7} />
    </g>
  );
}

/* ------------------------------------------------------------ scenes */

export const SCENES: SceneDef[] = [
  {
    id: 'busstop',
    name: 'Bus Stop',
    quip: 'Where all the important conversations happen. The bus is always late.',
    groundY: 900,
    render: () => (
      <g>
        {sky('#7ec8ff', '#d4efff', 'sky-bus')}
        {cloud(260, 140, 1.2)}
        {cloud(1180, 110, 1)}
        {cloud(820, 200, 0.7)}
        {mountains(640)}
        <path d="M 0 640 Q 300 590 600 630 T 1200 610 T 1600 630 L 1600 720 L 0 720 Z" {...f('#eef5ff')} />
        {[80, 230, 420, 1090, 1240, 1500].map((x, i) => pine(x, 670 + (i % 2) * 20, 0.9 + (i % 3) * 0.12))}
        <rect x={0} y={700} width={1600} height={90} {...f('#6d6f78')} />
        <path d="M 0 745 L 1600 745" stroke="#f2c230" strokeWidth={6} strokeDasharray="60 40" />
        {snowGround(790)}
        <g>
          <rect x={1372} y={500} width={14} height={390} {...f('#9aa3ad')} />
          <rect x={1300} y={470} width={160} height={110} rx={10} {...f('#d33b2c')} />
          <rect x={1312} y={482} width={136} height={86} rx={6} fill="none" stroke="#fff" strokeWidth={4} />
          <text x={1380} y={520} textAnchor="middle" fontFamily={DISPLAY} fontSize={32} fill="#fff">
            BUS
          </text>
          <text x={1380} y={556} textAnchor="middle" fontFamily={DISPLAY} fontSize={32} fill="#fff">
            STOP
          </text>
        </g>
        {pine(140, 960, 1.5)}
      </g>
    ),
  },
  {
    id: 'mainstreet',
    name: 'Main Street',
    quip: 'Shop local! The local shops are weird, but shop anyway.',
    groundY: 930,
    render: () => {
      const shops = [
        { x: 0, w: 320, h: 380, color: '#d9a066', roof: '#8a1f2b', name: ['BARGAIN', 'BARN'], awning: '#d33b2c' },
        { x: 320, w: 300, h: 430, color: '#7fbf3f', roof: '#2e8b47', name: ['PANCAKES', '& TAXES'], awning: '#f2c230' },
        { x: 620, w: 340, h: 360, color: '#5aaeea', roof: '#26367a', name: ['MUSEUM', 'OF ROCKS'], awning: '#ffffff' },
        { x: 960, w: 320, h: 410, color: '#e86fb0', roof: '#8b5cc7', name: ["SHAKEY'S", 'ICE SHACK'], awning: '#2ec4c4' },
        { x: 1280, w: 320, h: 390, color: '#f2c230', roof: '#f0742a', name: ["BOB'S", 'HAIRCUTS'], awning: '#3b6fd8' },
      ];
      const base = 780;
      return (
        <g>
          {sky('#7ec8ff', '#d4efff', 'sky-main')}
          {cloud(300, 100, 1)}
          {cloud(1300, 140, 1.2)}
          {mountains(480, '#9f9bd6')}
          {shops.map((s, i) => (
            <g key={i}>
              <rect x={s.x} y={base - s.h} width={s.w} height={s.h} {...f(s.color)} />
              <rect x={s.x - 6} y={base - s.h - 26} width={s.w + 12} height={30} {...f(s.roof)} />
              {sign(s.x + s.w / 2, base - s.h + 62, s.w - 60, 92, s.name, '#fff', s.roof, 32)}
              {windowPane(s.x + 30, base - 200, 110, 100)}
              <rect x={s.x + s.w - 120} y={base - 190} width={80} height={190} {...f(shade(s.color, -0.35))} />
              <circle cx={s.x + s.w - 54} cy={base - 92} r={6} fill="#f2c230" stroke={O} strokeWidth={2} />
              <path d={`M ${s.x + 20} ${base - 232} L ${s.x + 160} ${base - 232} L ${s.x + 170} ${base - 206} L ${s.x + 10} ${base - 206} Z`} {...f(s.awning)} />
              <path d={`M ${s.x + 20} ${base - s.h - 20} q ${s.w / 2 - 20} -16 ${s.w - 40} 0`} fill="none" stroke="#fff" strokeWidth={10} strokeLinecap="round" />
            </g>
          ))}
          <text x={430} y={base - 110} fontFamily={DISPLAY} fontSize={18} fill="#2e8b47">OPEN 24/7</text>
          <text x={1340} y={base - 250} fontFamily={DISPLAY} fontSize={16} fill="#3b6fd8">WE CUT CORNERS</text>
          <rect x={0} y={base} width={1600} height={60} {...f('#c9ced6')} />
          <rect x={0} y={base + 60} width={1600} height={200} {...f('#7b7d86')} />
          <path d={`M 0 ${base + 150} L 1600 ${base + 150}`} stroke="#f2f2f2" strokeWidth={6} strokeDasharray="70 50" />
          <path d={`M 0 ${base + 4} q 80 -26 160 0 q 60 -18 120 0 L 280 ${base + 4} Z M 1200 ${base + 4} q 100 -30 200 0 q 100 -24 200 0 Z`} {...f('#f4f8ff')} />
          <g>
            <rect x={760} y={base - 300} width={14} height={300} {...f('#3d3d44')} />
            <path d={`M 740 ${base - 300} L 794 ${base - 300} L 784 ${base - 340} L 750 ${base - 340} Z`} {...f('#3d3d44')} />
            <circle cx={767} cy={base - 318} r={9} fill="#fff6a8" />
          </g>
        </g>
      );
    },
  },
  {
    id: 'classroom',
    name: 'Classroom',
    quip: 'Learning happens here. Allegedly. Sources unconfirmed.',
    groundY: 950,
    render: () => (
      <g>
        <rect x={0} y={0} width={1600} height={760} fill="#cfe3c0" />
        <rect x={0} y={740} width={1600} height={260} {...f('#b07a4a')} />
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M ${i * 200} 760 L ${i * 200 - 140} 1000`} stroke="#8a5a32" strokeWidth={3} />
        ))}
        <rect x={0} y={724} width={1600} height={24} {...f('#7a4a2a')} />
        <rect x={360} y={120} width={880} height={420} rx={8} {...f('#7a4a2a')} />
        <rect x={384} y={144} width={832} height={372} fill="#2f5d3a" />
        <g fontFamily="'Comic Sans MS', 'Chalkboard SE', cursive" fill="#f4f4f4">
          <text x={420} y={210} fontSize={46}>
            TODAY'S LESSON:
          </text>
          <text x={470} y={280} fontSize={60}>
            DON'T.
          </text>
          <text x={420} y={370} fontSize={38}>
            2 + 2 = FISH?
          </text>
          <text x={420} y={440} fontSize={30} opacity={0.85}>
            Homework: pg 4-400
          </text>
        </g>
        <path d="M 980 300 q 40 -60 80 0 q 40 60 80 0 M 1020 420 l 50 -60 l 50 60 Z" fill="none" stroke="#f4f4f4" strokeWidth={5} />
        <rect x={384} y={516} width={832} height={18} {...f('#9a6a42')} />
        <rect x={520} y={510} width={40} height={10} fill="#fff" />
        <circle cx={1400} cy={170} r={60} {...f('#fff')} strokeWidth={6} />
        <path d="M 1400 170 L 1400 130 M 1400 170 L 1430 186" stroke={O} strokeWidth={6} strokeLinecap="round" />
        <rect x={80} y={160} width={200} height={260} {...f('#f2c230')} />
        <text x={180} y={210} textAnchor="middle" fontFamily={DISPLAY} fontSize={28} fill="#d33b2c">
          HANG IN
        </text>
        <text x={180} y={244} textAnchor="middle" fontFamily={DISPLAY} fontSize={28} fill="#d33b2c">
          THERE
        </text>
        <path d="M 110 280 L 250 280" stroke="#6b4226" strokeWidth={8} strokeLinecap="round" />
        <circle cx={180} cy={318} r={26} {...f('#9a9a9a')} />
        <path d="M 162 296 l -4 -18 l 14 10 Z M 198 296 l 4 -18 l -14 10 Z" {...f('#9a9a9a')} strokeWidth={2} />
        <path d="M 166 290 l 0 -14 M 194 290 l 0 -14" stroke={O} strokeWidth={5} strokeLinecap="round" />
        <circle cx={172} cy={316} r={3} fill={O} />
        <circle cx={188} cy={316} r={3} fill={O} />
        <rect x={1320} y={300} width={220} height={150} {...f('#5aaeea')} />
        <text x={1430} y={346} textAnchor="middle" fontFamily={DISPLAY} fontSize={22} fill="#fff">
          READING:
        </text>
        <text x={1430} y={380} textAnchor="middle" fontFamily={DISPLAY} fontSize={18} fill="#fff">
          IT'S LIKE TV
        </text>
        <text x={1430} y={410} textAnchor="middle" fontFamily={DISPLAY} fontSize={18} fill="#fff">
          IN YOUR HEAD
        </text>
        <path d="M 600 40 L 1000 40 L 1000 80 L 600 80 Z" {...f('#d33b2c')} />
        <text x={800} y={72} textAnchor="middle" fontFamily={DISPLAY} fontSize={30} fill="#fff">
          GO YETIS!
        </text>
        {[60, 1340].map((x) => (
          <g key={x}>
            <rect x={x} y={760} width={200} height={26} {...f('#c98b52')} />
            <rect x={x + 14} y={786} width={14} height={110} {...f('#9aa3ad')} />
            <rect x={x + 172} y={786} width={14} height={110} {...f('#9aa3ad')} />
            <rect x={x + 30} y={700} width={140} height={60} {...f('#3b6fd8')} />
          </g>
        ))}
        <circle cx={1440} cy={740} r={18} fill="#d33b2c" stroke={O} strokeWidth={3} />
      </g>
    ),
  },
  {
    id: 'cafeteria',
    name: 'Cafeteria',
    quip: 'Today\'s special: food-adjacent substance. Tomorrow: the same, but colder.',
    groundY: 950,
    render: () => (
      <g>
        <rect x={0} y={0} width={1600} height={720} fill="#f4ecd2" />
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d={`M ${i * 100} 0 L ${i * 100} 720`} stroke="#e2d6b4" strokeWidth={3} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M 0 ${i * 100} L 1600 ${i * 100}`} stroke="#e2d6b4" strokeWidth={3} />
        ))}
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 17 }, (_, col) => (
            <rect key={`${row}-${col}`} x={col * 100 - (row % 2) * 50} y={720 + row * 34} width={50} height={34} fill={(row + col) % 2 ? '#d9d9d9' : '#f4f4f4'} />
          )),
        )}
        <path d="M 0 720 L 1600 720" stroke={O} strokeWidth={3} />
        <rect x={300} y={420} width={1000} height={200} {...f('#b8bec7')} />
        <rect x={300} y={400} width={1000} height={30} {...f('#d8dde3')} />
        <path d="M 320 300 L 1280 300 L 1300 400 L 300 400 Z" fill="#dff3ff" opacity={0.6} stroke={O} strokeWidth={3} />
        {[
          ['#8a5530', 380],
          ['#9bd36a', 560],
          ['#f2c230', 740],
          ['#c9a7e8', 920],
          ['#d33b2c', 1100],
        ].map(([col, x]) => (
          <g key={x as number}>
            <rect x={x as number} y={406} width={140} height={22} rx={4} {...f('#9aa3ad')} strokeWidth={2} />
            <path d={scallop((x as number) + 70, 404, 58, 14, 7, 0.12)} {...f(col as string)} strokeWidth={2} />
          </g>
        ))}
        {sign(800, 160, 520, 150, ["TODAY: MEAT?", "TOMORROW: MEAT??"], '#fff', '#d33b2c', 46)}
        <rect x={80} y={120} width={180} height={240} {...f('#7fbf3f')} />
        <text x={170} y={180} textAnchor="middle" fontFamily={DISPLAY} fontSize={24} fill="#fff">
          EAT YOUR
        </text>
        <text x={170} y={214} textAnchor="middle" fontFamily={DISPLAY} fontSize={24} fill="#fff">
          VEGGIES
        </text>
        <text x={170} y={260} textAnchor="middle" fontFamily={DISPLAY} fontSize={34} fill="#26367a">
          OR ELSE
        </text>
        <path d="M 130 300 q 40 30 80 0" fill="none" stroke="#26367a" strokeWidth={6} />
        {[20, 1300].map((x) => (
          <g key={x}>
            <rect x={x} y={780} width={280} height={30} {...f('#5aaeea')} />
            <rect x={x + 20} y={810} width={16} height={100} {...f('#9aa3ad')} />
            <rect x={x + 244} y={810} width={16} height={100} {...f('#9aa3ad')} />
            <rect x={x + 60} y={758} width={90} height={22} rx={4} {...f('#f0742a')} strokeWidth={2} />
          </g>
        ))}
      </g>
    ),
  },
  {
    id: 'livingroom',
    name: 'Living Room',
    quip: 'Where the family gathers to ignore each other in comfort.',
    groundY: 950,
    render: () => (
      <g>
        <rect x={0} y={0} width={1600} height={740} fill="#f6c58f" />
        {Array.from({ length: 20 }, (_, i) => (
          <rect key={i} x={i * 80} y={0} width={30} height={740} fill="#f2b679" />
        ))}
        <rect x={0} y={720} width={1600} height={280} {...f('#8f6fb0')} />
        <rect x={0} y={700} width={1600} height={24} {...f('#7a4a2a')} />
        <rect x={1040} y={150} width={300} height={260} rx={6} {...f('#7a4a2a')} />
        <rect x={1060} y={170} width={260} height={220} fill="#bfe6ff" />
        {Array.from({ length: 30 }, (_, i) => (
          <circle key={i} cx={1070 + ((i * 53) % 240)} cy={180 + ((i * 37) % 200)} r={4} fill="#fff" />
        ))}
        <path d="M 1190 170 L 1190 390 M 1060 280 L 1320 280" stroke="#7a4a2a" strokeWidth={8} />
        <rect x={720} y={140} width={180} height={140} rx={4} {...f('#c9a07a')} />
        <rect x={736} y={156} width={148} height={108} fill="#9fd8ff" />
        <circle cx={790} cy={210} r={22} {...f('#fcd9b8')} strokeWidth={2} />
        <circle cx={834} cy={214} r={18} {...f('#e8b48a')} strokeWidth={2} />
        <path d="M 520 560 Q 500 420 600 420 L 1000 420 Q 1100 420 1080 560 L 1100 700 L 500 700 Z" {...f('#8a5530')} />
        <rect x={540} y={520} width={520} height={90} rx={30} {...f('#a5713d')} />
        <rect x={480} y={520} width={80} height={180} rx={30} {...f('#7a4a2a')} />
        <rect x={1040} y={520} width={80} height={180} rx={30} {...f('#7a4a2a')} />
        <rect x={600} y={460} width={110} height={70} rx={20} {...f('#f2c230')} />
        <rect x={120} y={500} width={300} height={40} {...f('#6b4226')} />
        <rect x={140} y={540} width={20} height={160} {...f('#6b4226')} />
        <rect x={380} y={540} width={20} height={160} {...f('#6b4226')} />
        <rect x={130} y={290} width={280} height={210} rx={14} {...f('#3d3d44')} />
        <rect x={152} y={310} width={236} height={160} rx={8} fill="#2ec4c4" />
        <text x={270} y={372} textAnchor="middle" fontFamily={DISPLAY} fontSize={28} fill="#fff" stroke={O} strokeWidth={1}>
          TOOT TOOT
        </text>
        <text x={270} y={408} textAnchor="middle" fontFamily={DISPLAY} fontSize={28} fill="#f2c230" stroke={O} strokeWidth={1}>
          HOUR!
        </text>
        <circle cx={196} cy={440} r={14} {...f('#fcd9b8')} strokeWidth={2} />
        <circle cx={344} cy={440} r={14} {...f('#e8b48a')} strokeWidth={2} />
        <path d="M 230 290 L 200 230 M 310 290 L 340 230" stroke={O} strokeWidth={4} />
        <rect x={1430} y={360} width={20} height={340} {...f('#3d3d44')} />
        <path d="M 1380 360 L 1500 360 L 1470 260 L 1410 260 Z" {...f('#fff6a8')} />
        <rect x={1380} y={650} width={120} height={50} rx={8} {...f('#3d3d44')} />
      </g>
    ),
  },
  {
    id: 'pond',
    name: 'Frozen Pond',
    quip: 'Thin ice? Probably fine. Definitely fine. Don\'t jump.',
    groundY: 930,
    render: () => (
      <g>
        {sky('#8fd0ff', '#e3f4ff', 'sky-pond')}
        {cloud(400, 120, 1.1)}
        {cloud(1250, 90, 0.9)}
        {mountains(560, '#7f8fc9')}
        <path d="M 0 560 Q 400 520 800 560 T 1600 550 L 1600 1000 L 0 1000 Z" {...f('#f4f8ff')} />
        {[60, 200, 330, 1260, 1400, 1530].map((x, i) => pine(x, 600 + (i % 2) * 24, 0.8 + (i % 3) * 0.1))}
        <ellipse cx={800} cy={720} rx={620} ry={120} {...f('#bfe6ff')} />
        <ellipse cx={800} cy={720} rx={540} ry={90} fill="#d6f0ff" />
        <path d="M 500 700 l 120 -20 M 900 760 l 160 -14 M 700 730 l 60 -8 M 1100 700 l 80 -10" stroke="#fff" strokeWidth={6} strokeLinecap="round" />
        <g>
          <rect x={1280} y={700} width={12} height={120} {...f('#7a4a2a')} />
          {sign(1286, 690, 220, 100, ['THIN ICE', '(PROBABLY FINE)'], '#fff', '#d33b2c', 28)}
        </g>
        <g>
          <rect x={160} y={800} width={240} height={22} {...f('#a5713d')} />
          <rect x={160} y={760} width={240} height={20} {...f('#a5713d')} />
          <rect x={180} y={822} width={14} height={60} {...f('#6b4226')} />
          <rect x={366} y={822} width={14} height={60} {...f('#6b4226')} />
          <path d="M 160 760 q 120 -16 240 0" fill="none" stroke="#fff" strokeWidth={10} strokeLinecap="round" />
        </g>
      </g>
    ),
  },
  {
    id: 'townsign',
    name: 'Welcome Sign',
    quip: 'Edit the town name! Population: you, and a whole lot of weirdos.',
    groundY: 930,
    render: (o) => {
      const town = (o.townName || 'SNOWPINE HOLLOW').toUpperCase().slice(0, 18);
      return (
        <g>
          {sky('#7ec8ff', '#d4efff', 'sky-town')}
          {cloud(200, 120, 1)}
          {cloud(1400, 160, 1.3)}
          {mountains(600)}
          <path d="M 0 600 Q 400 560 800 600 T 1600 590 L 1600 1000 L 0 1000 Z" {...f('#f4f8ff')} />
          {[90, 260, 1340, 1500].map((x, i) => pine(x, 640 + (i % 2) * 30, 1 + (i % 2) * 0.2))}
          <path d="M 640 1000 L 760 600 L 840 600 L 960 1000 Z" {...f('#8a8c95')} />
          <path d="M 800 620 L 800 660 M 800 700 L 800 760 M 800 810 L 800 890 M 800 940 L 800 1000" stroke="#f2c230" strokeWidth={8} />
          <rect x={430} y={200} width={22} height={460} {...f('#6b4226')} />
          <rect x={1150} y={200} width={22} height={460} {...f('#6b4226')} />
          <g transform="translate(0 -110)">
          <rect x={380} y={230} width={840} height={330} rx={14} {...f('#a5713d')} />
          <rect x={404} y={254} width={792} height={282} rx={8} fill="none" stroke="#f4ecc8" strokeWidth={6} />
          <text x={800} y={320} textAnchor="middle" fontFamily={DISPLAY} fontSize={44} fill="#f4ecc8">
            WELCOME TO
          </text>
          <text x={800} y={420} textAnchor="middle" fontFamily={DISPLAY} fontSize={town.length > 12 ? 62 : 84} fill="#fff" stroke={O} strokeWidth={3}>
            {town}
          </text>
          <text x={800} y={496} textAnchor="middle" fontFamily={DISPLAY} fontSize={34} fill="#f4ecc8">
            POPULATION: WEIRD
          </text>
          <path d="M 380 236 q 420 -40 840 0 l 0 14 q -420 -30 -840 0 Z" fill="#fff" stroke={O} strokeWidth={2} />
          </g>
        </g>
      );
    },
  },
  {
    id: 'below',
    name: 'Down Below',
    quip: 'It\'s warm down here. Too warm. The snacks are all spicy.',
    groundY: 930,
    render: () => (
      <g>
        {sky('#3a0b0b', '#a3241b', 'sky-below')}
        <path d="M 0 0 L 0 260 L 120 200 L 200 280 L 340 160 L 460 260 L 600 170 L 760 280 L 900 190 L 1060 270 L 1200 150 L 1360 260 L 1480 180 L 1600 240 L 1600 0 Z" {...f('#2a0606')} />
        {[200, 560, 980, 1380].map((x, i) => (
          <path key={i} d={`M ${x - 60} 720 Q ${x - 70} 600 ${x - 20} 560 Q ${x - 10} 620 ${x + 10} 600 Q ${x + 6} 520 ${x + 40} 480 Q ${x + 40} 580 ${x + 70} 620 Q ${x + 80} 680 ${x + 60} 720 Z`} {...f('#f0742a')} />
        ))}
        {[200, 560, 980, 1380].map((x, i) => (
          <path key={i} d={`M ${x - 30} 720 Q ${x - 30} 650 ${x} 620 Q ${x + 10} 660 ${x + 20} 640 Q ${x + 40} 680 ${x + 34} 720 Z`} fill="#f2c230" />
        ))}
        <path d="M 0 700 Q 400 660 800 700 T 1600 690 L 1600 1000 L 0 1000 Z" {...f('#5a1c12')} />
        <path d="M 0 790 Q 300 760 600 800 T 1200 790 T 1600 800 L 1600 850 Q 1200 830 800 850 T 0 840 Z" {...f('#ff8a1f')} />
        <path d="M 100 812 q 40 -10 80 0 M 700 822 q 50 -10 100 0 M 1300 812 q 40 -10 80 0" stroke="#ffe25c" strokeWidth={5} strokeLinecap="round" />
        {sign(1300, 420, 400, 140, ['WELCOME!', 'ABANDON ALL SNACKS'], '#2a0606', '#ff8a1f', 34)}
        <rect x={1290} y={490} width={20} height={220} {...f('#2a0606')} />
        <g transform="rotate(14 260 560)">
          <rect x={252} y={380} width={16} height={330} {...f('#3d3d44')} />
          <path d="M 220 380 L 220 320 M 260 380 L 260 300 M 300 380 L 300 320 M 220 380 L 300 380" fill="none" stroke={O} strokeWidth={14} strokeLinecap="round" />
          <path d="M 220 380 L 220 320 M 260 380 L 260 300 M 300 380 L 300 320 M 220 380 L 300 380" fill="none" stroke="#9aa3ad" strokeWidth={8} strokeLinecap="round" />
        </g>
      </g>
    ),
  },
  {
    id: 'above',
    name: 'Up Above',
    quip: 'Members only. The bouncer is very strict. Have you been nice?',
    groundY: 930,
    render: () => (
      <g>
        {sky('#fff6dc', '#ffd6ec', 'sky-above')}
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={`M 800 -100 L ${i * 150 - 60} 1000 L ${i * 150 + 10} 1000 Z`} fill="#fff" opacity={0.25} />
        ))}
        <g>
          <rect x={560} y={220} width={480} height={520} rx={240} fill="none" stroke="#f2c230" strokeWidth={22} />
          <rect x={560} y={220} width={480} height={520} rx={240} fill="none" stroke={O} strokeWidth={3} />
          {[620, 680, 740, 800, 860, 920, 980].map((x) => (
            <path key={x} d={`M ${x} ${x === 800 ? 222 : 260} L ${x} 740`} stroke="#fff" strokeWidth={10} />
          ))}
          <circle cx={800} cy={300} r={36} fill="#fff" stroke="#f2c230" strokeWidth={8} />
        </g>
        {cloud(200, 620, 2.2)}
        {cloud(1400, 600, 2.4)}
        <path d={scallop(800, 900, 900, 200, 26, 0.04)} {...f('#ffffff')} />
        {sign(330, 330, 280, 110, ['MEMBERS', 'ONLY'], '#fff', '#c99a1a', 40)}
        <rect x={322} y={385} width={16} height={180} {...f('#f2c230')} />
        <ellipse cx={1300} cy={250} rx={60} ry={14} fill="none" stroke="#f2c230" strokeWidth={10} />
        <ellipse cx={1180} cy={180} rx={40} ry={10} fill="none" stroke="#f2c230" strokeWidth={8} />
      </g>
    ),
  },
  {
    id: 'space',
    name: 'Outer Space',
    quip: 'Abducted again. Third time this month. The probing is getting old.',
    groundY: 940,
    render: () => {
      const rnd = seeded(42);
      return (
        <g>
          <rect x={0} y={0} width={1600} height={1000} fill="#0d1033" />
          {Array.from({ length: 120 }, (_, i) => (
            <circle key={i} cx={rnd() * 1600} cy={rnd() * 760} r={rnd() * 2.6 + 0.6} fill="#fff" opacity={0.5 + rnd() * 0.5} />
          ))}
          <path d={starPath(1200, 140, 16, 0.4)} fill="#fff6a8" />
          <circle cx={300} cy={220} r={110} {...f('#e86fb0')} />
          <ellipse cx={300} cy={220} rx={190} ry={40} fill="none" stroke="#f2c230" strokeWidth={12} transform="rotate(-14 300 220)" />
          <ellipse cx={300} cy={220} rx={190} ry={40} fill="none" stroke={O} strokeWidth={2} transform="rotate(-14 300 220)" />
          <circle cx={1420} cy={300} r={60} {...f('#3b8fd8')} />
          <path d="M 1380 270 q 30 -10 40 20 q -30 20 -50 0 Z M 1430 320 q 20 -6 30 10 q -20 14 -30 -10 Z" fill="#7fbf3f" />
          <g>
            <path d="M 900 330 L 760 760 L 1240 760 L 1100 330 Z" fill="#c8ff8a" opacity={0.35} />
            <ellipse cx={1000} cy={320} rx={170} ry={46} {...f('#9aa3ad')} />
            <path d="M 900 300 Q 1000 200 1100 300 Z" fill="#bfe6ff" opacity={0.9} stroke={O} strokeWidth={3} />
            {[-120, -60, 0, 60, 120].map((dx) => (
              <circle key={dx} cx={1000 + dx} cy={332} r={9} fill="#f2c230" stroke={O} strokeWidth={2} />
            ))}
          </g>
          <path d="M 0 760 Q 400 720 800 760 T 1600 750 L 1600 1000 L 0 1000 Z" {...f('#b4b8c4')} />
          {[
            [200, 840, 60],
            [700, 900, 40],
            [1200, 830, 70],
            [1450, 930, 36],
          ].map(([x, y, r]) => (
            <ellipse key={x} cx={x} cy={y} rx={r} ry={r * 0.3} fill="#8c909c" stroke={O} strokeWidth={2} />
          ))}
        </g>
      );
    },
  },
  {
    id: 'campfire',
    name: 'Campfire',
    quip: 'Scary stories, burnt marshmallows and at least one kid who wants to go home.',
    groundY: 930,
    render: () => {
      const rnd = seeded(9);
      return (
        <g>
          {sky('#0e1640', '#2b3a7a', 'sky-camp')}
          {Array.from({ length: 70 }, (_, i) => (
            <circle key={i} cx={rnd() * 1600} cy={rnd() * 500} r={rnd() * 2.2 + 0.5} fill="#fff" />
          ))}
          <circle cx={1320} cy={170} r={70} fill="#fff6c4" stroke={O} strokeWidth={3} />
          <circle cx={1296} cy={150} r={12} fill="#e9dfa8" />
          <circle cx={1350} cy={196} r={8} fill="#e9dfa8" />
          {[0, 150, 300, 1150, 1300, 1450, 1600].map((x, i) => (
            <path key={i} d={`M ${x - 110} 700 L ${x} ${380 + (i % 3) * 50} L ${x + 110} 700 Z`} fill="#0b2a1a" stroke="#050f0a" strokeWidth={3} />
          ))}
          <path d="M 0 680 Q 400 650 800 680 T 1600 670 L 1600 1000 L 0 1000 Z" {...f('#26364f')} />
          <circle cx={800} cy={820} r={300} fill="#ff9a3c" opacity={0.18} />
          <g>
            <path d="M 300 760 L 420 560 L 540 760 Z" {...f('#d33b2c')} />
            <path d="M 420 560 L 400 760 L 440 760 Z" fill="#8a1f2b" stroke={O} strokeWidth={2} />
            <path d="M 1080 760 L 1220 540 L 1360 760 Z" {...f('#2e8b47')} />
            <path d="M 1220 540 L 1200 760 L 1240 760 Z" fill="#1d5a2e" stroke={O} strokeWidth={2} />
          </g>
          <g>
            <rect x={700} y={840} width={200} height={26} rx={12} transform="rotate(12 800 853)" {...f('#7a4a2a')} />
            <rect x={700} y={840} width={200} height={26} rx={12} transform="rotate(-12 800 853)" {...f('#8a5530')} />
            <path d="M 740 850 Q 730 760 780 720 Q 780 780 800 770 Q 800 700 840 660 Q 840 760 860 760 Q 880 800 860 850 Z" {...f('#f0742a')} />
            <path d="M 770 850 Q 770 800 800 780 Q 810 810 820 800 Q 840 830 830 850 Z" fill="#f2c230" />
          </g>
        </g>
      );
    },
  },
  {
    id: 'studio',
    name: 'Photo Studio',
    quip: 'Professional headshots. Pick any backdrop colour. Say cheese.',
    groundY: 930,
    render: (o) => (
      <g>
        <defs>
          <radialGradient id="studio-spot" cx="0.5" cy="0.45" r="0.65">
            <stop offset="0" stopColor={shade(o.studioColor, 0.35)} />
            <stop offset="1" stopColor={shade(o.studioColor, -0.25)} />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={1600} height={1000} fill="url(#studio-spot)" />
        <path d="M 0 860 Q 800 820 1600 860 L 1600 1000 L 0 1000 Z" fill={shade(o.studioColor, -0.32)} />
        <ellipse cx={800} cy={940} rx={520} ry={50} fill="#000" opacity={0.12} />
      </g>
    ),
  },
];

/** Calm backdrop for the creator stage, drawn in character coordinates (ground at y = 480). */
export function StageBackdrop() {
  return (
    <g>
      {sky('#9fd8ff', '#e6f6ff', 'stage-sky')}
      <rect x={-200} y={-200} width={900} height={900} fill="url(#stage-sky)" />
      <path d={scallop(30, 20, 60, 22, 8, 0.16)} {...f('#fff')} strokeWidth={2} />
      <path d={scallop(390, -10, 70, 24, 8, 0.16)} {...f('#fff')} strokeWidth={2} />
      <g transform="translate(-120 150) scale(0.5)">{mountains(560, '#a4a2d8')}</g>
      <path d="M -200 420 Q 0 395 200 420 T 700 418 L 700 700 L -200 700 Z" {...f('#f6f9ff')} />
      <g transform="translate(-30 30) scale(0.55)">{pine(0, 760)}</g>
      <g transform="translate(400 50) scale(0.48)">{pine(0, 760)}</g>
      <ellipse cx={200} cy={486} rx={150} ry={14} fill="#1d1d1d" opacity={0.12} />
    </g>
  );
}

export function getScene(id: string): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}

/* ------------------------------------------------------------ overlays */

export type Weather = 'none' | 'snow' | 'confetti' | 'hearts' | 'cheesy';

export const WEATHERS: { id: Weather; label: string }[] = [
  { id: 'none', label: 'Clear' },
  { id: 'snow', label: '❄️ Snow' },
  { id: 'confetti', label: '🎉 Confetti' },
  { id: 'hearts', label: '💖 Hearts' },
  { id: 'cheesy', label: '🧀 Snack Storm' },
];

export function WeatherLayer({ weather }: { weather: Weather }) {
  if (weather === 'none') return null;
  const rnd = seeded(weather.length * 97 + 13);
  const n = weather === 'snow' ? 110 : 70;
  const items = Array.from({ length: n }, () => ({ x: rnd() * 1600, y: rnd() * 1000, r: rnd(), rot: rnd() * 360 }));
  const colors = ['#d33b2c', '#f2c230', '#3b6fd8', '#7fbf3f', '#e86fb0', '#2ec4c4'];
  return (
    <g pointerEvents="none">
      {items.map((p, i) => {
        if (weather === 'snow') return <circle key={i} cx={p.x} cy={p.y} r={3 + p.r * 7} fill="#fff" opacity={0.85} stroke="#c9dcf2" strokeWidth={1} />;
        if (weather === 'confetti')
          return <rect key={i} x={p.x} y={p.y} width={10} height={18} fill={colors[i % colors.length]} transform={`rotate(${p.rot} ${p.x + 5} ${p.y + 9})`} />;
        if (weather === 'hearts')
          return (
            <path
              key={i}
              d={`M ${p.x} ${p.y + 10} C ${p.x - 16} ${p.y} ${p.x - 10} ${p.y - 12} ${p.x} ${p.y - 4} C ${p.x + 10} ${p.y - 12} ${p.x + 16} ${p.y} ${p.x} ${p.y + 10} Z`}
              fill={i % 2 ? '#e5322d' : '#f27bb4'}
              stroke={O}
              strokeWidth={1.5}
            />
          );
        return (
          <path
            key={i}
            d={`M ${p.x - 14} ${p.y} q 6 -10 14 -4 q 10 -6 14 4 q 4 10 -8 10 q -12 4 -20 -10 Z`}
            fill="#f0742a"
            stroke={O}
            strokeWidth={1.5}
            transform={`rotate(${p.rot} ${p.x} ${p.y})`}
          />
        );
      })}
    </g>
  );
}
