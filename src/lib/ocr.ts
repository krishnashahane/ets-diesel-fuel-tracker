// Client-side OCR via self-hosted Tesseract.js (CSP-safe, no LLM, no CDN).
// Text extraction only; all business logic stays rule-based.
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',                       // dir; picks simd/non-simd core
        langPath: '/ocr',                       // serves eng.traineddata.gz
        gzip: true,
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

export interface OcrResult { text: string; confidence: number; fields: OcrFields }
export interface OcrFields { numbers: number[]; amount?: number; qty?: number; rate?: number; reading?: number; plate?: string }

// Register sheets are dense, low-contrast and often photographed at an angle.
// Grayscale + adaptive contrast + upscaling lifts Tesseract's line recall substantially.
export async function preprocessForOcr(dataUrl: string, minDim = 1600, maxDim = 2600): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const longest = Math.max(img.width, img.height);
    const scale = Math.min(maxDim / longest, Math.max(1, minDim / longest));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    const px = d.data;
    // Pass 1: luminance + histogram.
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
      px[i] = px[i + 1] = px[i + 2] = y;
      hist[y]++;
    }
    // Pass 2: 2%/98% percentile stretch — robust against shadows and flash glare.
    const total = w * h;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span)) | 0;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    return dataUrl; // Preprocessing is an optimisation, never a hard requirement.
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

// Full-page recognition for register sheets: returns raw text laid out line by line.
// Never throws — an empty result routes the operator to manual entry.
export async function runRegisterOcr(dataUrl: string): Promise<{ text: string; confidence: number }> {
  try {
    const prepared = await preprocessForOcr(dataUrl);
    const worker = await getWorker();
    const { data } = await worker.recognize(prepared);
    return { text: data.text || '', confidence: Math.round(data.confidence || 0) };
  } catch {
    return { text: '', confidence: 0 };
  }
}

// Never throws — OCR is best-effort. On failure returns empty result so manual entry proceeds.
export async function runOcr(dataUrl: string): Promise<OcrResult> {
  try {
    const prepared = await preprocessForOcr(dataUrl);
    const worker = await getWorker();
    const { data } = await worker.recognize(prepared);
    const text = data.text || '';
    return { text, confidence: Math.round(data.confidence || 0), fields: parseFields(text) };
  } catch {
    return { text: '', confidence: 0, fields: { numbers: [] } };
  }
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    try { (await workerPromise).terminate(); } catch { /* noop */ }
    workerPromise = null;
  }
}

// Rule-based extraction of candidate values from OCR text.
export function parseFields(text: string): OcrFields {
  const clean = text.replace(/[, ]/g, '');
  const numbers = (clean.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
  const near = (labels: RegExp): number | undefined => {
    const m = clean.match(labels);
    return m && Number.isFinite(+m[1]) ? +m[1] : undefined;
  };
  const plateMatch = text.toUpperCase().replace(/\s|-/g, '').match(/[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}/);
  return {
    numbers,
    amount: near(/(?:amount|amt|total|rs\.?|₹)\D{0,4}(\d+(?:\.\d+)?)/i),
    qty: near(/(?:qty|quantity|litre|liter|ltr|vol)\D{0,4}(\d+(?:\.\d+)?)/i),
    rate: near(/(?:rate|price|\/l|per\s*l)\D{0,4}(\d+(?:\.\d+)?)/i),
    reading: near(/(?:km|reading|odo|meter|mtr)\D{0,4}(\d+(?:\.\d+)?)/i),
    plate: plateMatch?.[0],
  };
}
