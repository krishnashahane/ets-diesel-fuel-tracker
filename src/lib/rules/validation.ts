// Rule-based transaction validation engine. No AI/LLM.
import type { Vehicle, Transaction, Driver, Source, FuelType } from '../types';
import { RULES } from './config';

export interface EntryInput {
  source: Source;
  fuelType: FuelType;
  date: string;          // YYYY-MM-DD
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
}

// Business-mandated fields for every diesel entry, in every entry mode.
// Kept as data so the UI, the register grid and the API all show the same list.
export const MANDATORY_FIELDS = [
  { field: 'diesel', label: 'Diesel Quantity (Liters)' },
  { field: 'currentReading', label: 'Odometer Reading' },
  { field: 'vehicleNo', label: 'Bus Number' },
  { field: 'pump', label: 'Pump Name / Diesel Filling Location' },
] as const;

// True when the four mandatory business fields are present. Used for fast
// client-side gating; validateEntry remains the authoritative server check.
export function hasMandatory(e: Partial<EntryInput>): boolean {
  return Number(e.diesel) > 0
    && Number(e.currentReading) > 0
    && !!e.vehicleNo?.trim()
    && !!(e.pump?.trim() || e.fillingLocation?.trim());
}

export interface ValidationIssue { field: string; message: string; }
export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateEntry(
  e: EntryInput,
  ctx: { vehicles: Vehicle[]; drivers: Driver[]; transactions: Transaction[] },
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  const warn = (field: string, message: string) => warnings.push({ field, message });

  // Mandatory fields. The four business-critical ones (quantity, odometer, bus
  // number, pump/filling location) are enforced for every entry regardless of
  // source or entry mode — see MANDATORY_FIELDS.
  if (!e.vehicleNo?.trim()) err('vehicleNo', 'Bus number is required');
  if (!e.driverName?.trim()) err('driverName', 'Driver is required');
  if (!e.co?.trim()) err('co', 'Client / site is required');
  if (!e.date?.trim()) err('date', 'Transaction date is required');
  if (!(e.diesel > 0)) err('diesel', 'Diesel quantity (litres) is required and must be greater than zero');
  if (!(e.rate > 0)) err('rate', 'Rate must be greater than zero');
  if (!(e.currentReading > 0)) err('currentReading', 'Odometer reading is required and must be greater than zero');
  // Pump name OR an explicit filling location satisfies the requirement — tanker
  // fillings at remote sites record the location rather than a pump vendor.
  if (!e.pump?.trim() && !e.fillingLocation?.trim())
    err('pump', 'Pump name / diesel filling location is required');

  // Future date
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const d = new Date(e.date + 'T00:00:00');
  if (isNaN(d.getTime())) err('date', 'Invalid date');
  else if (d.getTime() > today.getTime()) err('date', 'Date cannot be in the future');

  // Vehicle master
  const veh = ctx.vehicles.find((v) => v.vehicleNo === norm(e.vehicleNo));
  if (!veh) err('vehicleNo', 'Vehicle not found in master data');
  else if (!veh.active) err('vehicleNo', 'Vehicle is inactive');

  // Driver master (warning only — free-text drivers exist historically)
  if (e.driverName?.trim() && !ctx.drivers.some((dr) => eq(dr.name, e.driverName)))
    warn('driverName', 'Driver not in master list');

  // Negative / implausible quantity
  if (e.diesel < 0) err('diesel', 'Quantity cannot be negative');

  // Odometer checks
  if (e.currentReading < 0 || e.prevReading < 0) err('currentReading', 'Odometer cannot be negative');
  if (e.currentReading > 0 && e.prevReading > 0) {
    if (e.currentReading < e.prevReading) err('currentReading', 'Odometer rollback: current < previous');
    else if (e.currentReading - e.prevReading > RULES.odometerMaxJump)
      warn('currentReading', `Distance ${e.currentReading - e.prevReading} km exceeds normal single-fill jump`);
  }

  // Tank capacity / fuel limit
  const cap = veh?.seatingCap && veh.seatingCap > 0 ? RULES.maxTankCapacity : RULES.maxTankCapacity;
  if (e.diesel > cap) err('diesel', `Quantity exceeds tank capacity limit (${cap} L)`);

  // Duplicate receipt (bill no)
  if (e.billNo?.trim() && ctx.transactions.some((t) => t.billNo && eq(t.billNo, e.billNo)))
    err('billNo', 'Duplicate receipt / bill number');

  // Duplicate transaction (same vehicle + date + quantity)
  if (ctx.transactions.some((t) => t.vehicleNo === norm(e.vehicleNo) && t.date === e.date && t.diesel === e.diesel))
    err('vehicleNo', 'Duplicate transaction for vehicle on this date');

  // Missing receipt image
  if (!e.hasReceipt) warn('receipt', 'No receipt/register image attached');

  return { ok: errors.length === 0, errors, warnings };
}

export const norm = (s: string) => (s || '').toUpperCase().replace(/\s+/g, '');
const eq = (a: string, b: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
