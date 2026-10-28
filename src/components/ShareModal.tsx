import { useRef, useState } from 'react';
import type { CharacterState } from '../types';
import { Modal } from './Modal';
import { CharacterGroup } from '../character/Character';
import { charFrame, getGeo, GROUND_Y } from '../character/geometry';
import { shareUrl } from '../lib/share';
import { downloadBlob, safeFileName, svgToBlob } from '../lib/exportImage';
import { toast } from '../lib/toast';
import { sfx } from '../lib/sound';

export function ShareModal({ c, onClose }: { c: CharacterState; onClose: () => void }) {
  const url = shareUrl(c);
  const [copied, setCopied] = useState(false);
  const pngRef = useRef<SVGSVGElement>(null);
  const jpgRef = useRef<SVGSVGElement>(null);
  const f = charFrame(getGeo(c.body, c.headShape));
  const viewBox = `${f.x} ${f.y} ${f.w} ${f.h}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.getElementById('share-url') as HTMLInputElement | null;
      input?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    sfx.ding();
    toast('Link copied. Go spread the weirdness.', 'good');
  };

  const download = async (kind: 'png' | 'jpg') => {
    const svg = kind === 'png' ? pngRef.current : jpgRef.current;
    if (!svg) return;
    try {
      const blob = await svgToBlob(svg, {
        width: 1000,
        height: Math.round((1000 * f.h) / f.w),
        type: kind === 'png' ? 'image/png' : 'image/jpeg',
        background: kind === 'png' ? 'transparent' : '#ffffff',
      });
      downloadBlob(blob, `${safeFileName(c.name)}.${kind}`);
      sfx.ding();
    } catch (e) {
      toast(`Download failed: ${(e as Error).message}`, 'bad');
    }
  };

  return (
    <Modal title="Share your weirdo" icon="🔗" onClose={onClose} narrow>
      <p style={{ fontWeight: 800, marginTop: 0 }}>Anyone with this link gets an exact copy of {c.name || 'your character'} (photo faces stay private on your device).</p>
      <div className="share-link">
        <input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Share link" />
        <button className="btn red" onClick={copy}>
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <h3 style={{ fontFamily: 'var(--display)', fontWeight: 400, margin: '18px 0 8px' }}>Or grab a picture</h3>
      <div className="row">
        <button className="btn yellow" onClick={() => void download('png')}>
          🖼️ Transparent PNG (stickers!)
        </button>
        <button className="btn" onClick={() => void download('jpg')}>
          ⬇️ JPEG
        </button>
      </div>
      <svg ref={pngRef} viewBox={viewBox} width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
        <CharacterGroup c={c} />
      </svg>
      <svg ref={jpgRef} viewBox={viewBox} width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
        <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#bfe6ff" />
        <rect x={f.x} y={GROUND_Y - 36} width={f.w} height={f.y + f.h - GROUND_Y + 36} fill="#f4f8ff" />
        <CharacterGroup c={c} />
      </svg>
    </Modal>
  );
}
