export type Role = 'superadmin' | 'admin' | 'operations' | 'site_rep' | 'supervisor' | 'driver';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  createdAt: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface Vehicle {
  vehicleNo: string;
  seatingCap: number | null;
  ac: string;
  fuel: string;
  make: string;
  ownership: string;
  costCenter: string;
  standardAvg: number | null;
  fixedAvg: number | null;
  active: boolean;
}

export interface Driver { id: string; name: string; licenseNo: string; active: boolean; }
export interface Pump { id: string; name: string; active: boolean; }
export interface Site { id: string; name: string; active: boolean; }

export type FuelType = 'Diesel' | 'CNG';
export type Source = 'pump' | 'tanker';
export type TxStatus = 'Draft' | 'Submitted' | 'Verified' | 'Approved' | 'Locked';
// How the record reached the system. 'register' = extracted from a photo of the
// manually maintained diesel register (off-site tanker locations).
export type EntryMode = 'manual' | 'register';

// Provenance for register-extracted rows, so every field can be traced back to the sheet.
export interface RegisterRef {
  batchId: string;      // one batch per uploaded register page
  lineNo: number;       // 1-based line within the OCR text
  rawLine: string;      // the OCR line the values came from
  ocrConfidence: number;// page-level OCR confidence 0-100
  edited: boolean;      // operator corrected one or more extracted values
}

export interface Transaction {
  id: string;
  billNo: string;
  srNo: number;
  date: string;
  co: string;
  pump: string;
  driverName: string;
  vehicleNo: string;
  fixAvg: number;
  diesel: number;
  rate: number;
  amount: number;
  currentReading: number;
  prevReading: number;
  totalKm: number;
  recdAvg: number;
  actualQty: number;
  excessDiesel: number;
  debitToDriver: number;
  remarks: string;
  fillingLocation: string;
  fuelType: FuelType;
  source: Source;
  status: TxStatus;
  createdBy?: string;
  createdAt?: string;
  exceptions?: ExceptionCase[];
  // Workflow additions
  photos?: EntryPhotos;
  geo?: GeoPoint | null;
  device?: DeviceInfo | null;
  ocrConfidence?: number;          // 0-100, avg across photos (0 = no OCR)
  validationStatus?: ValidationStatus;
  ip?: string;                     // public IP captured server-side at submission
  entryMode?: EntryMode;           // 'manual' (in-app capture) or 'register' (sheet upload)
  registerRef?: RegisterRef | null;// provenance when entryMode === 'register'
}

// Super-admin configurable system settings.
export interface AppSettings {
  ocrEnabled: boolean;             // run client-side OCR auto-fill
  ocrThreshold: number;            // 0-100; below this a record is flagged for Review
  requirePhotos: boolean;          // require all 4 photos to submit
}

export const DEFAULT_SETTINGS: AppSettings = { ocrEnabled: true, ocrThreshold: 70, requirePhotos: true };

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ExceptionStatus = 'Open' | 'Assigned' | 'Under Review' | 'Resolved' | 'Closed';

export interface ExceptionCase {
  code: string;
  message: string;
  risk: RiskLevel;
}

// Workflow: location tracking + device capture on login and every submission.
export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number;   // meters
  ts: string;         // ISO timestamp
  status?: 'ok' | 'denied' | 'unavailable';
}

export interface DeviceInfo {
  ua: string;
  browser: string;
  os: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

// Workflow: 4 required photos per in-app submission, linked to the record.
// `register` replaces them for entries extracted from a manual register page.
export interface EntryPhotos {
  plate?: string;      // Vehicle number plate
  bill?: string;       // Diesel slip / challan / bill
  meter?: string;      // Diesel filled meter
  odometer?: string;   // Vehicle odometer
  register?: string;   // Photo of the manually maintained diesel register page
}

export type ValidationStatus = 'Valid' | 'Review' | 'Invalid';

export interface AuditLog {
  id: string;
  ts: string;
  userId: string;
  username: string;
  action: string;
  entity: string;
  entityId: string;
  ip: string;
  detail?: string;
  geo?: GeoPoint | null;
  device?: DeviceInfo | null;
}
