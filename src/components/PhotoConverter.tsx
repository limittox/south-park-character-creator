import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterState } from '../types';
import { Modal } from './Modal';
import { CharacterSvg } from '../character/Character';
import {
  analyzeFace,
  clampBox,
  cropFace,
  detectFaceBox,
  nativeFaceBox,
  traitsToCharacter,
  type Box,
  type FacialHairGuess,
  type HairLength,
  type Traits,
} from '../lib/photoAnalysis';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../data/palette';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

interface Props {
  base: CharacterState;
  onApply: (c: CharacterState) => void;
  onClose: () => void;
}

type Step = 'pick' | 'camera' | 'adjust';
const MAX_DIM = 720;

const SCAN_LINES = [
  'Consulting the town scientist…',
  'Measuring head roundness…',
  'Counting freckles…',
  'Judging your haircut…',
  'Converting to construction paper…',
];

export function PhotoConverter({ base, onApply, onClose }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [drag, setDrag] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [auto, setAuto] = useState<Traits | null>(null);
  const [over, setOver] = useState<Partial<Traits>>({});
  const [scanning, setScanning] = useState(false);
  const [scanLine, setScanLine] = useState(SCAN_LINES[0]);
  const [usePhoto, setUsePhoto] = useState(false);
  const [posterize, setPosterize] = useState(true);
  const [faceUrl, setFaceUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  /** Draw a source onto the work canvas, find the face, analyse it. */
  const ingest = useCallback(async (source: CanvasImageSource, sw: number, sh: number, mirror = false) => {
    setStep('adjust');
    await new Promise((r) => requestAnimationFrame(r));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(1, MAX_DIM / Math.max(sw, sh));
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.save();
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    imgDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setScanning(true);
    setOver({});
    let i = 0;
    const ticker = window.setInterval(() => setScanLine(SCAN_LINES[++i % SCAN_LINES.length]), 380);
    const found = (await nativeFaceBox(canvas)) ?? detectFaceBox(imgDataRef.current);
    await new Promise((r) => setTimeout(r, 1200));
    window.clearInterval(ticker);
    setBox(clampBox(found, canvas.width, canvas.height));
    setScanning(false);
    sfx.ding();
  }, []);

  const loadFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('That is not a picture. Nice try.', 'bad');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      void ingest(img, img.naturalWidth, img.naturalHeight).finally(() => URL.revokeObjectURL(url));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Could not read that image. Is it cursed?', 'bad');
    };
    img.src = url;
  };

  const startCamera = async () => {
    setCamError(null);
    setStep('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCamError('No camera access. Either you said no, or your camera is shy. Try uploading a photo instead.');
    }
  };

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    sfx.shutter();
    const w = v.videoWidth;
    const h = v.videoHeight;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d')!.drawImage(v, 0, 0, w, h);
    stopCamera();
    void ingest(tmp, w, h, true);
  };

  // Re-analyse whenever the oval moves.
  useEffect(() => {
    if (!box || !imgDataRef.current) return;
    const id = window.setTimeout(() => {
      setAuto(analyzeFace(imgDataRef.current!, box));
      if (canvasRef.current) setFaceUrl(cropFace(canvasRef.current, box, posterize));
    }, 120);
    return () => window.clearTimeout(id);
  }, [box, posterize]);

  const traits: Traits | null = useMemo(() => (auto ? { ...auto, ...over } : null), [auto, over]);
  const preview = useMemo(() => (traits ? traitsToCharacter(base, traits, faceUrl, usePhoto) : null), [base, traits, faceUrl, usePhoto]);

  /* ---- oval dragging ---- */
  const dragState = useRef<{ mode: 'move' | 'resize'; px: number; py: number; start: Box } | null>(null);
  const onPointerDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!box) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { mode, px: e.clientX, py: e.clientY, start: box };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!d || !canvas || !frame) return;
    const k = canvas.width / frame.getBoundingClientRect().width;
    const dx = (e.clientX - d.px) * k;
    const dy = (e.clientY - d.py) * k;
    const next = d.mode === 'move' ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx, h: d.start.h + dy };
    setBox(clampBox(next, canvas.width, canvas.height));
  };
  const onPointerUp = () => {
    dragState.current = null;
  };

  const set = <K extends keyof Traits>(k: K, v: Traits[K]) => setOver((o) => ({ ...o, [k]: v }));

  const apply = () => {
    if (!preview) return;
    sfx.ding();
    onApply(preview);
  };

  const W = canvasRef.current?.width ?? 1;
  const H = canvasRef.current?.height ?? 1;

  return (
    <Modal title="Photo → Paper Person" icon="🤳" onClose={onClose}>
      {step === 'pick' && (
        <div>
          <div
            className={`dropzone${drag ? ' drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              loadFile(e.dataTransfer.files[0]);
            }}
          >
            <div style={{ fontSize: 56 }}>📷➡️🧑‍🎨</div>
            <div style={{ fontSize: 20 }}>Drop a selfie here, or…</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn red big" onClick={() => fileRef.current?.click()}>
                📁 Upload a photo
              </button>
              {'mediaDevices' in navigator && (
                <button className="btn blue big" onClick={startCamera}>
                  🎥 Use webcam
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
            <p style={{ maxWidth: 520, color: '#5d5a52', fontSize: 14 }}>
              Works best with one face, looking at the camera, in decent light. Your photo never leaves your device. (We are too lazy to build a server anyway.)
            </p>
          </div>
        </div>
      )}

      {step === 'camera' && (
        <div style={{ textAlign: 'center' }}>
          {camError ? (
            <p style={{ fontWeight: 800 }}>{camError}</p>
          ) : (
            <div className="photo-frame" style={{ maxWidth: 640, margin: '0 auto' }}>
              <video ref={videoRef} playsInline muted style={{ transform: 'scaleX(-1)' }} />
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            {!camError && (
              <button className="btn red big" onClick={snap}>
                📸 Snap!
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                stopCamera();
                setStep('pick');
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      <div className="photo-steps" style={{ display: step === 'adjust' ? undefined : 'none' }}>
        <div>
          <div className="photo-frame" ref={frameRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <canvas ref={canvasRef} />
            {scanning && (
              <>
                <div className="scanning" />
                <div className="face-oval" style={{ left: '30%', top: '20%', width: '40%', height: '50%', borderStyle: 'dotted' }}>
                  <span className="tag">{scanLine}</span>
                </div>
              </>
            )}
            {!scanning && box && (
              <div
                className="face-oval"
                style={{ left: `${(box.x / W) * 100}%`, top: `${(box.y / H) * 100}%`, width: `${(box.w / W) * 100}%`, height: `${(box.h / H) * 100}%` }}
                onPointerDown={onPointerDown('move')}
              >
                <span className="tag">Drag me onto your face</span>
                <span className="handle" onPointerDown={onPointerDown('resize')} aria-label="Resize" />
              </div>
            )}
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#5d5a52' }}>
            Fit the oval from hairline to chin. Drag to move, pull the yellow dot to resize. The detective work updates as you go.
          </p>
          <div className="row">
            <button className="btn small" onClick={() => setStep('pick')}>
              ← Different photo
            </button>
            <button className="btn small" onClick={() => setOver({})} disabled={!Object.keys(over).length}>
              ↺ Reset my tweaks
            </button>
          </div>
        </div>

        <div>
          {preview && traits ? (
            <>
              <div className="preview-card">
                <CharacterSvg c={preview} viewBox="-40 -70 480 570" />
              </div>
              <h3 style={{ fontFamily: 'var(--display)', fontWeight: 400, margin: '12px 0 8px' }}>Our scientists detected:</h3>
              <div className="trait-list">
                <div className="trait">
                  <span>Skin</span>
                  <div className="mini-swatches">
                    {SKIN_TONES.map((s) => (
                      <button key={s.color} className="swatch" style={{ background: s.color }} aria-label={s.name} aria-pressed={traits.skin === s.color} onClick={() => set('skin', s.color)} />
                    ))}
                  </div>
                </div>
                <div className="trait">
                  <span>Hair colour</span>
                  <div className="mini-swatches">
                    {HAIR_COLORS.map((s) => (
                      <button key={s.color} className="swatch" style={{ background: s.color }} aria-label={s.name} aria-pressed={traits.hairColor === s.color} onClick={() => set('hairColor', s.color)} />
                    ))}
                  </div>
                </div>
                <div className="trait">
                  <span>Hair</span>
                  <div className="chips">
                    {(['bald', 'short', 'medium', 'long'] as HairLength[]).map((h) => (
                      <button key={h} className="chip-btn" aria-pressed={traits.hairLength === h} onClick={() => set('hairLength', h)}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="trait">
                  <span>Face fuzz</span>
                  <div className="chips">
                    {(['none', 'mustache', 'beard'] as FacialHairGuess[]).map((h) => (
                      <button key={h} className="chip-btn" aria-pressed={traits.facialHair === h} onClick={() => set('facialHair', h)}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="trait">
                  <span>Glasses</span>
                  <div className="chips">
                    <button className="chip-btn" aria-pressed={!traits.glasses} onClick={() => set('glasses', false)}>
                      nope
                    </button>
                    <button className="chip-btn" aria-pressed={traits.glasses} onClick={() => set('glasses', true)}>
                      yep
                    </button>
                  </div>
                </div>
                <div className="trait">
                  <span>Expression</span>
                  <div className="chips">
                    <button className="chip-btn" aria-pressed={!traits.smile} onClick={() => set('smile', false)}>
                      polite smile
                    </button>
                    <button className="chip-btn" aria-pressed={traits.smile} onClick={() => set('smile', true)}>
                      big grin
                    </button>
                  </div>
                </div>
                <div className="trait">
                  <span>Shirt</span>
                  <div className="mini-swatches">
                    {CLOTH_COLORS.map((col) => (
                      <button key={col} className="swatch" style={{ background: col }} aria-label={`Shirt ${col}`} aria-pressed={traits.shirt === col} onClick={() => set('shirt', col)} />
                    ))}
                  </div>
                </div>
                <div className="trait">
                  <span>Cursed mode</span>
                  <div className="chips">
                    <button className="chip-btn" aria-pressed={usePhoto} onClick={() => setUsePhoto((u) => !u)}>
                      {usePhoto ? '😱 using my real face' : 'paste my real face on'}
                    </button>
                    {usePhoto && (
                      <button className="chip-btn" aria-pressed={posterize} onClick={() => setPosterize((p) => !p)}>
                        cut-out filter
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn red big" onClick={apply}>
                  ✂️ Paper-ify me!
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              <p>{scanning ? scanLine : 'Waiting for a face…'}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
