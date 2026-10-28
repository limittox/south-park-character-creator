import { memo, useId, type ReactNode } from 'react';
import type { CategoryId, CharacterState, RenderCtx } from '../types';
import {
  armGeo,
  armPath,
  CANADIAN_SPLIT_Y,
  CHAR_VIEWBOX,
  getGeo,
  HEAD_RX,
  HEAD_RY,
  HEAD_SHAPES,
  handPos,
  quadAt,
  type ArmGeo,
} from './geometry';
import { ink, O } from './parts/common';
import { BROWS, EYES, FACE_DETAILS, FACIAL_HAIR, MOUTHS, NOSES, talkingMouth } from './parts/face';
import { HAIR } from './parts/hair';
import { HATS } from './parts/hats';
import { FACE_GEAR, GLASSES } from './parts/glasses';
import { BOTTOMS, NECKWEAR, SHOES, TOPS, type TopDef } from './parts/clothes';
import { HELD, SIDEKICKS } from './parts/held';

function byId<T extends { id: string }>(list: T[], id: string): T {
  return list.find((x) => x.id === id) ?? list[0];
}

export interface CharacterProps {
  c: CharacterState;
  /** Mouth openness while talking, 0..1. */
  talk?: number;
  onPartClick?: (cat: CategoryId) => void;
}

function crossLine(a: ArmGeo, t: number, half: number) {
  const [x, y] = quadAt(a, t);
  const u = 1 - t;
  const tx = 2 * u * (a.ctrl[0] - a.start[0]) + 2 * t * (a.end[0] - a.ctrl[0]);
  const ty = 2 * u * (a.ctrl[1] - a.start[1]) + 2 * t * (a.end[1] - a.ctrl[1]);
  const len = Math.hypot(tx, ty) || 1;
  const nx = (-ty / len) * half;
  const ny = (tx / len) * half;
  return `M ${x - nx} ${y - ny} L ${x + nx} ${y + ny}`;
}

/** A whole character as an SVG <g>, in character coordinates (ground at y = 480). */
export const CharacterGroup = memo(function CharacterGroup({ c, talk = 0, onPartClick }: CharacterProps) {
  const rawId = useId();
  const prefix = 'c' + rawId.replace(/[^a-zA-Z0-9]/g, '');
  let counter = 0;
  const uid = (name: string) => `${prefix}-${name}-${counter++}`;

  const g = getGeo(c.body, c.headShape);
  const shape = HEAD_SHAPES[c.headShape] ?? HEAD_SHAPES.round;
  const ctx = (color: string): RenderCtx => ({ c, g, color, uid, talk });

  const top = byId(TOPS, c.top);
  const bottom = byId(BOTTOMS, c.bottom);
  const shoes = byId(SHOES, c.shoes);
  const neck = byId(NECKWEAR, c.neck);
  const hat = byId(HATS, c.hat);
  const hair = byId(HAIR, c.hair);
  const eyes = byId(EYES, c.eyes);
  const brows = byId(BROWS, c.brows);
  const mouth = byId(MOUTHS, c.mouth);
  const nose = byId(NOSES, c.nose);
  const detail = byId(FACE_DETAILS, c.faceDetail);
  const fhair = byId(FACIAL_HAIR, c.facialHair);
  const glasses = byId(GLASSES, c.glasses);
  const gear = byId(FACE_GEAR, c.faceGear);
  const held = byId(HELD, c.held);
  const pet = byId(SIDEKICKS, c.sidekick);

  const part = (cat: CategoryId, children: ReactNode, key?: string) =>
    onPartClick ? (
      <g
        key={key}
        className="sp-part"
        data-cat={cat}
        onClick={(e) => {
          e.stopPropagation();
          onPartClick(cat);
        }}
      >
        {children}
      </g>
    ) : (
      <g key={key}>{children}</g>
    );

  const sx = g.headRx / HEAD_RX;
  const sy = g.headRy / HEAD_RY;
  const headT = `translate(${g.headCx} ${g.headCy}) scale(${sx} ${sy})`;

  // Hair hidden under hats.
  let hairClipId: string | undefined;
  let hairClipDef: ReactNode = null;
  if (hat.clipHairAbove !== undefined && !hat.hidesHair) {
    hairClipId = uid('hairclip');
    hairClipDef = (
      <clipPath id={hairClipId}>
        <rect x={-400} y={hat.clipHairAbove} width={800} height={900} />
      </clipPath>
    );
  }
  const showHair = !hat.hidesHair && !hat.hidesFace;
  const hairClip = hairClipId ? `url(#${hairClipId})` : undefined;

  const photo = c.usePhotoFace && c.photoFace ? c.photoFace : null;
  const canadian = !!shape.canadian;
  const mouthOpen = talk > 0.05;

  /* ---- arms ---- */
  const sleeveColor = top.sleeveColor?.(ctx(c.topColor)) ?? c.topColor;
  const armBase = top.sleeves === 'long' ? sleeveColor : c.skin;
  const armsVisible = top.sleeves !== 'hidden';
  const arms = ([-1, 1] as const).map((side) => armGeo(g, side));

  const armOutline = armsVisible
    ? arms.map((a) => <path key={a.side} d={armPath(a)} fill="none" stroke={O} strokeWidth={g.armW + 6} strokeLinecap="round" />)
    : null;

  const armColor = armsVisible
    ? arms.map((a) => (
        <g key={a.side}>
          <path d={armPath(a)} fill="none" stroke={armBase} strokeWidth={g.armW} strokeLinecap="round" />
          {top.sleeves === 'short' && (
            <>
              <path d={armPath(a, 0, 0.5)} fill="none" stroke={sleeveColor} strokeWidth={g.armW + 1} strokeLinecap="butt" />
              <path d={crossLine(a, 0.5, g.armW / 2 + 2)} stroke={O} strokeWidth={2.4} />
            </>
          )}
          {top.sleeves === 'long' && <path d={crossLine(a, 0.86, g.armW / 2 + 2)} stroke={O} strokeWidth={2.2} />}
          <path d={armPath(a, 0.34, 0.92)} transform={`translate(${-a.side * g.armW * 0.46} 0)`} fill="none" stroke={O} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      ))
    : null;

  const mitten = top.mittens?.(ctx(c.topColor)) ?? c.skin;
  const hands = ([-1, 1] as const).map((side) => {
    const [hx, hy] = handPos(g, side);
    return (
      <g key={side}>
        <ellipse cx={hx} cy={hy} rx={g.handR} ry={g.handR * 1.05} fill={mitten} {...ink} />
        <ellipse
          cx={hx - side * g.handR * 0.72}
          cy={hy - g.handR * 0.5}
          rx={g.handR * 0.36}
          ry={g.handR * 0.56}
          transform={`rotate(${-side * 28} ${hx - side * g.handR * 0.72} ${hy - g.handR * 0.5})`}
          fill={mitten}
          {...ink}
        />
      </g>
    );
  });

  /* ---- head contents (head coordinates) ---- */
  const faceParts = (): ReactNode[] => {
    if (hat.hidesFace) return [];
    const out: ReactNode[] = [];
    out.push(part('faceDetail', detail.render(ctx(c.hairColor)), 'detail'));
    if (photo) {
      out.push(part('skin', <PhotoFace src={photo} talk={talk} uid={uid} />, 'photo'));
    } else {
      out.push(part('nose', nose.render(ctx(c.hairColor)), 'nose'));
      if (fhair.under) out.push(part('facialHair', fhair.under(ctx(c.hairColor)), 'fh-under'));
      if (canadian) {
        // the split line *is* the mouth
      } else {
        out.push(part('mouth', mouthOpen ? talkingMouth(talk) : mouth.render(ctx(c.hairColor)), 'mouth'));
      }
      if (fhair.over) out.push(part('facialHair', fhair.over(ctx(c.hairColor)), 'fh-over'));
      out.push(part('eyes', eyes.render(ctx(c.hairColor)), 'eyes'));
    }
    if (gear.render) out.push(part('faceGear', gear.render(ctx(c.hairColor)), 'gear'));
    return out;
  };

  const headFront = (): ReactNode => (
    <>
      {part('skin', <path d={shape.path} fill={c.skin} {...ink} />, 'skin')}
      {faceParts()}
      {showHair && hair.front && part('hair', <g clipPath={hairClip}>{hair.front(ctx(c.hairColor))}</g>, 'hairfront')}
      {/* Brows sit on top of fringes so they stay visible; hats still cover them. */}
      {!hat.hidesFace && !photo && c.brows !== 'none' && part('brows', <BrowHalo skin={c.skin} uid={uid}>{brows.render(ctx(c.hairColor))}</BrowHalo>, 'brows')}
      {!hat.hidesFace && glasses.render && part('glasses', glasses.render(ctx(c.glassesColor)), 'glasses')}
      {hat.front && part('hat', hat.front(ctx(c.hatColor)), 'hat')}
    </>
  );

  let head: ReactNode;
  if (canadian) {
    const lift = talk * 20;
    const topId = uid('cantop');
    const botId = uid('canbot');
    const gapId = uid('cangap');
    const split = CANADIAN_SPLIT_Y;
    const lineHalf = 128 * Math.sqrt(Math.max(0, 1 - (split / 106) ** 2)) - 2;
    head = (
      <>
        <clipPath id={topId}>
          <rect x={-400} y={-600} width={800} height={600 + split} />
        </clipPath>
        <clipPath id={botId}>
          <rect x={-400} y={split} width={800} height={600} />
        </clipPath>
        <clipPath id={gapId}>
          <rect x={-400} y={split - lift - 2} width={800} height={lift + 4} />
        </clipPath>
        {lift > 0 && <path d={shape.path} fill="#4a1414" clipPath={`url(#${gapId})`} />}
        <g clipPath={`url(#${botId})`}>{headFront()}</g>
        <path d={`M ${-lineHalf} ${split} Q 0 ${split + 6} ${lineHalf} ${split}`} fill="none" stroke={O} strokeWidth={3.5} />
        <g transform={`translate(0 ${-lift})`}>
          <g clipPath={`url(#${topId})`}>{headFront()}</g>
          {lift > 0 && <path d={`M ${-lineHalf} ${split} Q 0 ${split + 6} ${lineHalf} ${split}`} fill="none" stroke={O} strokeWidth={3} />}
        </g>
      </>
    );
  } else {
    head = headFront();
  }

  const bottomColor = top.legsMatch ? c.topColor : c.bottomColor;

  return (
    <g className="sp-char">
      {hairClipDef && <defs>{hairClipDef}</defs>}
      {pet.render && part('sidekick', pet.render(ctx(c.heldColor)))}
      {neck.back && part('neck', neck.back(ctx(c.neckColor)))}
      {showHair && hair.back && (
        <g transform={headT}>{part('hair', <g clipPath={hairClip}>{hair.back(ctx(c.hairColor))}</g>)}</g>
      )}
      {hat.back && <g transform={headT}>{part('hat', hat.back(ctx(c.hatColor)))}</g>}
      {part('bottom', bottom.render(ctx(bottomColor)))}
      {part('shoes', shoes.render(ctx(c.shoesColor)))}
      {top.skirt && part('top', top.skirt(ctx(c.topColor)))}
      {armOutline}
      {part(
        'top',
        <>
          {top.torso(ctx(c.topColor))}
          {armColor}
        </>,
      )}
      {held.render && part('held', held.render(ctx(c.heldColor)))}
      {part('top', hands)}
      {top.over && part('top', top.over(ctx(c.topColor)))}
      {neck.front && !neck.overHead && part('neck', neck.front(ctx(c.neckColor)))}
      <g transform={headT}>{head}</g>
      {neck.front && neck.overHead && part('neck', neck.front(ctx(c.neckColor)))}
    </g>
  );
});

/** Skin-coloured outline so brows read even when they sit on top of dark hair. */
function BrowHalo({ skin, uid, children }: { skin: string; uid: (n: string) => string; children: ReactNode }) {
  const id = uid('browhalo');
  return (
    <>
      <filter id={id} x="-30%" y="-80%" width="160%" height="260%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="spread" />
        <feFlood floodColor={skin} result="flood" />
        <feComposite in="flood" in2="spread" operator="in" result="halo" />
        <feMerge>
          <feMergeNode in="halo" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <g filter={`url(#${id})`}>{children}</g>
    </>
  );
}

function PhotoFace({ src, talk, uid }: { src: string; talk: number; uid: (n: string) => string }) {
  const faceId = uid('face');
  const topId = uid('facetop');
  const botId = uid('facebot');
  const drop = talk * 16;
  const split = 46;
  const img = <image href={src} x={-88} y={-92} width={176} height={196} preserveAspectRatio="xMidYMid slice" />;
  return (
    <g>
      <clipPath id={faceId}>
        <ellipse cx={0} cy={6} rx={84} ry={94} />
      </clipPath>
      <clipPath id={topId}>
        <rect x={-200} y={-200} width={400} height={200 + split} />
      </clipPath>
      <clipPath id={botId}>
        <rect x={-200} y={split} width={400} height={200} />
      </clipPath>
      <g clipPath={`url(#${faceId})`}>
        {drop > 0 && <rect x={-90} y={split - 2} width={180} height={drop + 4} fill="#4a1414" />}
        <g clipPath={`url(#${topId})`}>{img}</g>
        <g transform={`translate(0 ${drop})`}>
          <g clipPath={`url(#${botId})`}>{img}</g>
        </g>
      </g>
      <ellipse cx={0} cy={6 + drop / 2} rx={83} ry={93 + drop / 2} fill="none" stroke={O} strokeWidth={2.5} strokeDasharray="7 4" />
    </g>
  );
}

export interface CharacterSvgProps extends CharacterProps {
  viewBox?: string;
  className?: string;
  title?: string;
}

export const DEFAULT_VIEWBOX = `${CHAR_VIEWBOX.x} ${CHAR_VIEWBOX.y} ${CHAR_VIEWBOX.w} ${CHAR_VIEWBOX.h}`;

export function CharacterSvg({ viewBox = DEFAULT_VIEWBOX, className, title, ...rest }: CharacterSvgProps) {
  return (
    <svg viewBox={viewBox} className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title ?? rest.c.name}>
      <CharacterGroup {...rest} />
    </svg>
  );
}

export { byId };
export type { TopDef };
