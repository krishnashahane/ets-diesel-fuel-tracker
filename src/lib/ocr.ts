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

// Never throws — OCR is best-effort. On failure returns empty result so manual entry proceeds.
export async function runOcr(dataUrl: string): Promise<OcrResult> {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(dataUrl);
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
