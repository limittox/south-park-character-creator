import fontUrl from '@fontsource/luckiest-guy/files/luckiest-guy-latin-400-normal.woff2?url';
import { FLAT_CSS } from '../character/flat';

const SVG_NS = 'http://www.w3.org/2000/svg';
let fontCss: Promise<string> | null = null;

/** SVGs rendered as images cannot see page fonts, so the display font is inlined. */
function getFontCss(): Promise<string> {
  if (!fontCss) {
    fontCss = fetch(fontUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return `@font-face{font-family:'Luckiest Guy';src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
      })
      .catch(() => '');
  }
  return fontCss;
}

export interface ExportOptions {
  width: number;
  height: number;
  type?: 'image/jpeg' | 'image/png';
  quality?: number;
  background?: string;
}

export async function svgToBlob(svg: SVGSVGElement, opts: ExportOptions): Promise<Blob> {
  const { width, height, type = 'image/jpeg', quality = 0.92, background = '#ffffff' } = opts;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.querySelectorAll('[data-export-ignore]').forEach((n) => n.remove());
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = (await getFontCss()) + FLAT_CSS;
  clone.insertBefore(style, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the picture.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    if (type === 'image/jpeg' || background !== 'transparent') {
      ctx.fillStyle = background === 'transparent' ? '#ffffff' : background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed.'))), type, quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function safeFileName(name: string): string {
  return (name.trim() || 'character').replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase().slice(0, 40) || 'character';
}

/** Share through the OS share sheet when possible. Returns false if unsupported. */
export async function shareBlob(blob: Blob, filename: string, text: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], text });
    return true;
  } catch {
    return true; // user cancelled: still "handled"
  }
}
