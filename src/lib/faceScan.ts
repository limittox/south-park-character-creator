import type { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import type { Pt, Segment } from './faceTraits';

/**
 * The photo scanner's brains: Google's MediaPipe face landmarker (478 points on the face plus
 * expression scores) and a selfie segmenter that labels every pixel as hair, face skin, body
 * skin, clothes, accessories or background. Both run on the device; only the model files are
 * downloaded, once, and then kept in the browser's cache storage.
 */

const MODELS = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  seg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
};
const CACHE = 'paper-town-models-v1';

export interface ScannedFace {
  /** All 478 landmarks, in pixels of the scanned image. */
  points: Pt[];
  /** Expression scores (0..1) keyed by name, e.g. mouthSmileLeft, jawOpen, eyeBlinkRight. */
  blend: Record<string, number>;
}

interface Engine {
  face: FaceLandmarker;
  seg: ImageSegmenter;
}

let engine: Promise<Engine> | null = null;

async function fetchModel(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const buf = new Uint8Array(await hit.arrayBuffer());
      onBytes(buf.length);
      return buf;
    }
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onBytes(total);
  }
  const buf = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.length;
  }
  try {
    await cache?.put(url, new Response(buf.slice(), { headers: { 'Content-Type': 'application/octet-stream' } }));
  } catch {
    /* storage full or blocked: we'll just download again next time */
  }
  return buf;
}

/** Approximate download size of both models, for the progress bar. */
export const MODEL_BYTES = 3_758_596 + 16_371_837;

/** Loads the scanner once. `onProgress` gets 0..1 while the models download. */
export function loadScanner(onProgress?: (f: number) => void): Promise<Engine> {
  if (!engine) {
    const got = { face: 0, seg: 0 };
    const tick = () => onProgress?.(Math.min(1, (got.face + got.seg) / MODEL_BYTES));
    engine = (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = { wasmLoaderPath, wasmBinaryPath };
      const [faceBuf, segBuf] = await Promise.all([
        fetchModel(MODELS.face, (n) => ((got.face = n), tick())),
        fetchModel(MODELS.seg, (n) => ((got.seg = n), tick())),
      ]);
      const face = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: faceBuf, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 6,
        minFaceDetectionConfidence: 0.35,
        outputFaceBlendshapes: true,
      });
      const seg = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: segBuf, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      return { face, seg };
    })();
    // Let a failed load (offline, blocked) be retried next time.
    engine.catch(() => (engine = null));
  }
  return engine;
}

/** Finds every face in the picture, biggest first. */
export async function scanFaces(canvas: HTMLCanvasElement): Promise<ScannedFace[]> {
  const { face } = await loadScanner();
  const res = face.detect(canvas);
  const W = canvas.width;
  const H = canvas.height;
  const faces = res.faceLandmarks.map((lms, i) => {
    const blend: Record<string, number> = {};
    for (const c of res.faceBlendshapes[i]?.categories ?? []) blend[c.categoryName] = c.score;
    return { points: lms.map((p) => ({ x: p.x * W, y: p.y * H })), blend };
  });
  const size = (f: ScannedFace) => Math.hypot(f.points[454].x - f.points[234].x, f.points[454].y - f.points[234].y);
  return faces.sort((a, b) => size(b) - size(a));
}

/**
 * Labels the pixels around one head. The segmenter looks at a 256-pixel square, so we hand it a
 * cut-out from just above the hair to the shoulders rather than the whole picture.
 */
export async function segmentHead(canvas: HTMLCanvasElement, f: ScannedFace): Promise<Segment> {
  const { seg } = await loadScanner();
  const p = f.points;
  const faceW = Math.hypot(p[454].x - p[234].x, p[454].y - p[234].y);
  const faceH = Math.hypot(p[152].x - p[10].x, p[152].y - p[10].y);
  const cx = (p[234].x + p[454].x) / 2;
  const top = Math.max(0, p[10].y - faceH * 1.1);
  const bottom = Math.min(canvas.height, p[152].y + faceH * 1.7);
  const half = Math.max(faceW * 1.8, (bottom - top) * 0.42);
  const left = Math.max(0, cx - half);
  const right = Math.min(canvas.width, cx + half);
  const w = right - left;
  const h = bottom - top;
  const scale = Math.min(1, 640 / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, left, top, w, h, 0, 0, out.width, out.height);
  const data = ctx.getImageData(0, 0, out.width, out.height);
  const r = seg.segment(out);
  const mask = r.categoryMask!;
  let labels: Uint8Array = mask.getAsUint8Array().slice();
  if (mask.width !== out.width || mask.height !== out.height) labels = resizeLabels(labels, mask.width, mask.height, out.width, out.height);
  r.close();
  return { img: { data: data.data, width: out.width, height: out.height }, labels, x: left, y: top, scale };
}

function resizeLabels(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x++) out[y * dw + x] = src[sy * sw + Math.min(sw - 1, Math.floor((x * sw) / dw))];
  }
  return out;
}

/** Moves landmarks from the scanned image into a segment's own pixels. */
export function toSegment(points: Pt[], s: Segment): Pt[] {
  return points.map((p) => ({ x: (p.x - s.x) * s.scale, y: (p.y - s.y) * s.scale }));
}
