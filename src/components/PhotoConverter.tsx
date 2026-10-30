import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterState } from '../types';
import { Modal } from './Modal';
import { CharacterSvg } from '../character/Character';
import { analyzeFace, clampBox, cropFace, detectFaceBox, nativeFaceBox, traitsToCharacter, type Box, type Traits } from '../lib/photoAnalysis';
import { headRoll, ovalFromLandmarks, readFace, type Reading, type Segment } from '../lib/faceTraits';
import { loadScanner, scanFaces, segmentHead, toSegment, type ScannedFace } from '../lib/faceScan';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../data/palette';
import { HAIR } from '../character/parts/hair';
import { EYES, FACIAL_HAIR, MOUTHS } from '../character/parts/face';
import { GLASSES } from '../character/parts/glasses';
import { HATS } from '../character/parts/hats';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';

interface Props {
  base: CharacterState;
  onApply: (c: CharacterState) => void;
  onClose: () => void;
}

type Step = 'pick' | 'camera' | 'adjust';
/** Big enough for the scanner to see glasses frames and stubble, small enough to stay quick. */
const MAX_DIM = 1280;

const SCAN_LINES = [
  'Consulting the town scientist…',
  'Placing 478 dots on your face…',
  'Measuring head roundness…',
  'Separating hair from hat…',
  'Judging your haircut…',
  'Converting to construction paper…',
];

/** X-ray colours for the segmenter's labels: background, hair, body skin, face skin, clothes, accessories. */
const XRAY: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [236, 64, 196, 150],
  [255, 168, 64, 110],
  [255, 226, 77, 90],
  [64, 200, 255, 110],
  [120, 255, 90, 150],
];

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** The scanned face whose oval sits under the given box, if any. */
function faceUnder(faces: ScannedFace[], b: Box): number {
  const c = center(b);
  let best = -1;
  let bestD = Infinity;
  faces.forEach((f, i) => {
    const o = ovalFromLandmarks(f.points);
    const oc = center(o);
    const d = Math.hypot(oc.x - c.x, oc.y - c.y);
    if (d < Math.max(o.w, o.h) * 0.5 && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

export function PhotoConverter({ base, onApply, onClose }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [drag, setDrag] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [auto, setAuto] = useState<Traits | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [over, setOver] = useState<Partial<Traits>>({});
  const [scanning, setScanning] = useState(false);
  const [scanLine, setScanLine] = useState(SCAN_LINES[0]);
  const [progress, setProgress] = useState<number | null>(null);
  const [engine, setEngine] = useState<'ai' | 'basic' | null>(null);
  const [faces, setFaces] = useState<ScannedFace[]>([]);
  const [faceIdx, setFaceIdx] = useState(-1);
  const [xray, setXray] = useState(false);
  const [usePhoto, setUsePhoto] = useState(false);
  const [posterize, setPosterize] = useState(true);
  const [faceUrl, setFaceUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const xrayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  const segRef = useRef<Segment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanId = useRef(0);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);
  // Start fetching the scanner as soon as the converter opens; it is usually ready by the time a photo is picked.
  useEffect(() => {
    loadScanner(setProgress).then(
      () => setProgress(null),
      () => setProgress(null),
    );
  }, []);

  /** Reads one scanned face: cut out the head, label its pixels, measure everything. */
  const readScanned = useCallback(async (f: ScannedFace) => {
    const canvas = canvasRef.current!;
    const seg = await segmentHead(canvas, f);
    segRef.current = seg;
    const r = readFace(seg, toSegment(f.points, seg), f.blend);
    setReading(r);
    setAuto(r.traits);
  }, []);

  /** Draw a source onto the work canvas, find the faces, analyse the biggest one. */
  const ingest = useCallback(
    async (source: CanvasImageSource, sw: number, sh: number, mirror = false) => {
      const id = ++scanId.current;
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
      setReading(null);
      setAuto(null);
      setFaces([]);
      setFaceIdx(-1);
      segRef.current = null;
      let i = 0;
      const ticker = window.setInterval(() => setScanLine(SCAN_LINES[++i % SCAN_LINES.length]), 420);
      const minWait = new Promise((r) => setTimeout(r, 900));
      let found: Box | null = null;
      try {
        await loadScanner(setProgress);
        setProgress(null);
        const list = await scanFaces(canvas);
        if (id !== scanId.current) return;
        setEngine('ai');
        setFaces(list);
        if (list.length) {
          setFaceIdx(0);
          found = ovalFromLandmarks(list[0].points);
          await readScanned(list[0]);
        } else toast('No face jumped out at us. Drag the oval onto one.', 'bad');
      } catch {
        setProgress(null);
        setEngine('basic');
      }
      found = found ?? (await nativeFaceBox(canvas)) ?? detectFaceBox(imgDataRef.current);
      await minWait;
      window.clearInterval(ticker);
      if (id !== scanId.current) return;
      setBox(clampBox(found, canvas.width, canvas.height));
      setScanning(false);
      sfx.ding();
    },
    [readScanned],
  );

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

  // When the oval moves onto another face, read that one instead; off every face, fall back to the colour guess.
  useEffect(() => {
    if (!box || scanning || !imgDataRef.current) return;
    const t = window.setTimeout(() => {
      const idx = engine === 'ai' ? faceUnder(faces, box) : -1;
      if (idx >= 0) {
        if (idx !== faceIdx) {
          setFaceIdx(idx);
          setOver({});
          void readScanned(faces[idx]);
        }
      } else {
        if (faceIdx !== -1) setFaceIdx(-1);
        segRef.current = null;
        setReading(null);
        setAuto(analyzeFace(imgDataRef.current!, box));
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [box, scanning, engine, faces, faceIdx, readScanned]);

  // The photo face for "cursed mode" follows the oval, levelled if the head is tilted.
  useEffect(() => {
    if (!box || !canvasRef.current) return;
    const t = window.setTimeout(() => {
      const roll = faceIdx >= 0 && faces[faceIdx] ? headRoll(faces[faceIdx].points) : 0;
      setFaceUrl(cropFace(canvasRef.current!, box, posterize, roll));
    }, 120);
    return () => window.clearTimeout(t);
  }, [box, posterize, faces, faceIdx]);

  // X-ray: paint what the scanner sees over the photo.
  useEffect(() => {
    const out = xrayRef.current;
    const canvas = canvasRef.current;
    if (!out || !canvas) return;
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.clearRect(0, 0, out.width, out.height);
    const seg = segRef.current;
    if (!xray || !seg || faceIdx < 0) return;
    const { width: w, height: h } = seg.img;
    const tint = new ImageData(w, h);
    for (let i = 0; i < seg.labels.length; i++) tint.data.set(XRAY[seg.labels[i]] ?? XRAY[0], i * 4);
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d')!.putImageData(tint, 0, 0);
    ctx.drawImage(tmp, seg.x, seg.y, w / seg.scale, h / seg.scale);
    ctx.fillStyle = '#fff';
    const r = Math.max(1.2, canvas.width / 600);
    for (const p of faces[faceIdx].points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [xray, reading, faceIdx, faces]);

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
  const pickFace = (i: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBox(clampBox(ovalFromLandmarks(faces[i].points), canvas.width, canvas.height));
  };

  const apply = () => {
    if (!preview) return;
    sfx.ding();
    onApply(preview);
  };

  const W = canvasRef.current?.width ?? 1;
  const H = canvasRef.current?.height ?? 1;
  const why = reading?.why ?? {};
  const measured = reading?.measured;

  /** A catalog dropdown with the scanner's own pick marked. */
  const select = (k: 'hair' | 'facialHair' | 'glasses' | 'mouth' | 'eyes' | 'hat', label: string, items: { id: string; name: string }[]) =>
    traits && (
      <div className="trait">
        <span>{label}</span>
        <select value={traits[k]} onChange={(e) => set(k, e.target.value)} aria-label={label}>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
              {auto?.[k] === it.id ? ' (detected)' : ''}
            </option>
          ))}
        </select>
        {why[k] && auto?.[k] === traits[k] && <em className="why">{why[k]}</em>}
      </div>
    );

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
            {progress !== null && <ScannerProgress f={progress} />}
            <p style={{ maxWidth: 540, color: '#5d5a52', fontSize: 14 }}>
              Works best looking at the camera in decent light, with your hair and shoulders in the shot. The face scanner runs on your device: your photo never
              leaves it. (We are too lazy to build a server anyway.)
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
            <canvas ref={xrayRef} className="xray" />
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
                <span className="tag">{faceIdx >= 0 ? 'Got you' : 'Drag me onto your face'}</span>
                <span className="handle" onPointerDown={onPointerDown('resize')} aria-label="Resize" />
              </div>
            )}
          </div>
          {scanning && progress !== null && <ScannerProgress f={progress} />}
          <p style={{ fontSize: 13, fontWeight: 700, color: '#5d5a52' }}>
            {engine === 'basic'
              ? 'The face scanner could not load (offline?), so this is a colour guess. Fit the oval from hairline to chin.'
              : faces.length > 1
                ? `Found ${faces.length} faces. Drag the oval onto the one you want, or pick one below.`
                : 'The oval only sets the crop for cursed mode. Drag it onto another face to scan that one instead.'}
          </p>
          <div className="row">
            <button className="btn small" onClick={() => setStep('pick')}>
              ← Different photo
            </button>
            <button className="btn small" onClick={() => setOver({})} disabled={!Object.keys(over).length}>
              ↺ Reset my tweaks
            </button>
            {engine === 'ai' && faceIdx >= 0 && (
              <button className="btn small" aria-pressed={xray} onClick={() => setXray((x) => !x)}>
                🔬 {xray ? 'Hide' : 'Show'} what the scanner sees
              </button>
            )}
            {faces.length > 1 &&
              faces.map((_, i) => (
                <button key={i} className="btn small" aria-pressed={faceIdx === i} onClick={() => pickFace(i)}>
                  Face {i + 1}
                </button>
              ))}
          </div>
          {xray && faceIdx >= 0 && (
            <p className="xray-key">
              <i style={{ background: 'rgb(236,64,196)' }} /> hair <i style={{ background: 'rgb(255,226,77)' }} /> face <i style={{ background: 'rgb(255,168,64)' }} /> skin{' '}
              <i style={{ background: 'rgb(64,200,255)' }} /> clothes <i style={{ background: 'rgb(120,255,90)' }} /> accessories
            </p>
          )}
        </div>

        <div>
          {preview && traits ? (
            <>
              <div className="preview-card">
                <CharacterSvg c={preview} />
              </div>
              <h3 style={{ fontFamily: 'var(--display)', fontWeight: 400, margin: '12px 0 8px' }}>
                {engine === 'ai' && faceIdx >= 0 ? 'Our scientists detected:' : 'Our scientists guessed:'}
              </h3>
              <div className="trait-list">
                <div className="trait">
                  <span>Skin</span>
                  <div className="mini-swatches">
                    {SKIN_TONES.map((s) => (
                      <button key={s.color} className="swatch" style={{ background: s.color }} aria-label={s.name} aria-pressed={traits.skin === s.color} onClick={() => set('skin', s.color)} />
                    ))}
                    {measured && (
                      <button className="swatch exact" style={{ background: measured.skin }} title="Exact colour from the photo" aria-label="Exact colour from the photo" aria-pressed={traits.skin === measured.skin} onClick={() => set('skin', measured.skin)} />
                    )}
                  </div>
                </div>
                <div className="trait">
                  <span>Hair colour</span>
                  <div className="mini-swatches">
                    {HAIR_COLORS.map((s) => (
                      <button key={s.color} className="swatch" style={{ background: s.color }} aria-label={s.name} aria-pressed={traits.hairColor === s.color} onClick={() => set('hairColor', s.color)} />
                    ))}
                    {measured?.hair && (
                      <button className="swatch exact" style={{ background: measured.hair }} title="Exact colour from the photo" aria-label="Exact hair colour from the photo" aria-pressed={traits.hairColor === measured.hair} onClick={() => set('hairColor', measured.hair!)} />
                    )}
                  </div>
                </div>
                {select('hair', 'Hairstyle', HAIR)}
                {select('facialHair', 'Facial hair', FACIAL_HAIR)}
                {select('glasses', 'Glasses', GLASSES)}
                {select('mouth', 'Mouth', MOUTHS)}
                {select('eyes', 'Eyes', EYES)}
                {select('hat', 'Hat', HATS)}
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

function ScannerProgress({ f }: { f: number }) {
  return (
    <div className="scan-progress" role="progressbar" aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.round(f * 100)}%` }} />
      <span>Downloading the face scanner (about 20 MB, just once)… {Math.round(f * 100)}%</span>
    </div>
  );
}
