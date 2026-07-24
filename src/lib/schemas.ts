// Shared request schemas. Single source of truth for every write endpoint so the
// single-entry form, the register bulk import and any future client agree exactly.
import { z } from 'zod';
import type { EntryPhotos, GeoPoint, DeviceInfo } from './types';

// Photos arrive as data URLs produced by the browser canvas. Constrain the media
// type explicitly: an unconstrained data: URL is an XSS vector once rendered.
const MAX_PHOTO_CHARS = 700_000;      // ~510 KB binary after base64 overhead
const MAX_REGISTER_CHARS = 2_000_000; // register pages are captured at higher resolution

export const dataUrlImage = (max: number) =>
  z.string().max(max).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Unsupported image payload');

export const photosSchema = z.object({
  plate: dataUrlImage(MAX_PHOTO_CHARS).optional(),
  bill: dataUrlImage(MAX_PHOTO_CHARS).optional(),
  meter: dataUrlImage(MAX_PHOTO_CHARS).optional(),
  odometer: dataUrlImage(MAX_PHOTO_CHARS).optional(),
  register: dataUrlImage(MAX_REGISTER_CHARS).optional(),
}).partial();

export const geoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(1_000_000),
  ts: z.string().max(40),
  status: z.enum(['ok', 'denied', 'unavailable']).optional(),
}).nullable().optional();

export const deviceSchema = z.object({
  ua: z.string().max(400),
  browser: z.string().max(40),
  os: z.string().max(40),
  deviceType: z.enum(['mobile', 'tablet', 'desktop']),
}).nullable().optional();

// Free text that is echoed back into the UI: strip control characters and cap length.
const strip = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, '').trim();

export const text = (max: number) => z.string().max(max).transform(strip);

// Required free text. The length check is repeated after stripping, so a value made
// only of whitespace or control characters is rejected rather than stored blank.
export const requiredText = (max: number, message: string) =>
  z.string().min(1, message).max(max).transform(strip).refine((v) => v.length > 0, { message });

/**
 * Core diesel entry payload.
 * Mandatory by business rule (enforced here AND in validateEntry):
 *   diesel > 0, currentReading > 0, vehicleNo, pump | fillingLocation.
 */
export const entrySchema = z.object({
  source: z.enum(['pump', 'tanker']),
  fuelType: z.enum(['Diesel', 'CNG']).default('Diesel'),
  entryMode: z.enum(['manual', 'register']).default('manual'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  billNo: text(64).default(''),
  co: requiredText(120, 'Client / site is required'),
  pump: text(120).default(''),
  vehicleNo: requiredText(40, 'Bus number is required'),
  driverName: requiredText(120, 'Driver is required'),
  diesel: z.number().finite().positive('Diesel quantity (litres) is required').max(100_000),
  rate: z.number().finite().positive('Rate is required').max(10_000),
  currentReading: z.number().finite().positive('Odometer reading is required').max(10_000_000),
  prevReading: z.number().finite().nonnegative().max(10_000_000).default(0),
  fixAvg: z.number().finite().nonnegative().max(1000).default(0),
  hasReceipt: z.boolean().default(false),
  remarks: text(500).optional(),
  fillingLocation: text(120).optional(),
  force: z.boolean().default(false),
  photos: photosSchema.optional(),
  geo: geoSchema,
  device: deviceSchema,
  ocrConfidence: z.number().min(0).max(100).optional(),
}).refine((v) => !!(v.pump?.trim() || v.fillingLocation?.trim()), {
  path: ['pump'],
  message: 'Pump name / diesel filling location is required',
});

export const MAX_BULK_ROWS = 60;

// Register import: one page photo + the operator-reviewed rows extracted from it.
export const bulkEntrySchema = z.object({
  batchId: z.string().max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  registerPhoto: dataUrlImage(MAX_REGISTER_CHARS).optional(),
  ocrText: z.string().max(50_000).optional(),   // evidence trail for the scan
  ocrConfidence: z.number().min(0).max(100).default(0),
  geo: geoSchema,
  device: deviceSchema,
  force: z.boolean().default(false),
  rows: z.array(z.object({
    lineNo: z.number().int().min(0).max(10_000).default(0),
    rawLine: text(400).default(''),
    edited: z.boolean().default(false),
    source: z.enum(['pump', 'tanker']).default('tanker'),
    fuelType: z.enum(['Diesel', 'CNG']).default('Diesel'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    billNo: text(64).default(''),
    co: text(120).default(''),
    pump: text(120).default(''),
    fillingLocation: text(120).optional(),
    vehicleNo: text(40).default(''),
    driverName: text(120).default(''),
    diesel: z.number().finite().nonnegative().max(100_000).default(0),
    rate: z.number().finite().nonnegative().max(10_000).default(0),
    currentReading: z.number().finite().nonnegative().max(10_000_000).default(0),
    prevReading: z.number().finite().nonnegative().max(10_000_000).default(0),
    remarks: text(500).optional(),
  })).min(1, 'No rows to import').max(MAX_BULK_ROWS, `Maximum ${MAX_BULK_ROWS} rows per register page`),
});

/**
 * Explicit payload types.
 *
 * These schemas are large enough (many fields, several `.transform()` effects,
 * an object-level `.refine()`) that zod's inferred output type degrades to `{}`
 * under the compiler's instantiation-depth limit — which silently erases every
 * field type at the call site. Declaring the shapes by hand keeps the handlers
 * strongly typed regardless of how the schemas grow.
 */
export interface EntryPayload {
  source: 'pump' | 'tanker';
  fuelType: 'Diesel' | 'CNG';
  entryMode: 'manual' | 'register';
  date: string;
  billNo: string;
  co: string;
  pump: string;
  vehicleNo: string;
  driverName: string;
  diesel: number;
  rate: number;
  currentReading: number;
  prevReading: number;
  fixAvg: number;
  hasReceipt: boolean;
  remarks?: string;
  fillingLocation?: string;
  force: boolean;
  photos?: EntryPhotos;
  geo?: GeoPoint | null;
  device?: DeviceInfo | null;
  ocrConfidence?: number;
}

export interface BulkRowPayload {
  lineNo: number;
  rawLine: string;
  edited: boolean;
  source: 'pump' | 'tanker';
  fuelType: 'Diesel' | 'CNG';
  date: string;
  billNo: string;
  co: string;
  pump: string;
  fillingLocation?: string;
  vehicleNo: string;
  driverName: string;
  diesel: number;
  rate: number;
  currentReading: number;
  prevReading: number;
  remarks?: string;
}

export interface BulkEntryPayload {
  batchId?: string;
  registerPhoto?: string;
  ocrText?: string;
  ocrConfidence: number;
  geo?: GeoPoint | null;
  device?: DeviceInfo | null;
  force: boolean;
  rows: BulkRowPayload[];
}
