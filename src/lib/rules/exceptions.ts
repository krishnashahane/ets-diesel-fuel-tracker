// Rule-based exception detection + financial leakage engine. No AI/LLM.
import type { Vehicle, Transaction, ExceptionCase } from '../types';
import type { CalcResult } from './calculations';
import type { EntryInput } from './validation';
import { RULES } from './config';
import { norm } from './validation';

export function detectExceptions(
  e: EntryInput,
  calc: CalcResult,
  ctx: { vehicle?: Vehicle; transactions: Transaction[] },
): ExceptionCase[] {
  const out: ExceptionCase[] = [];
  const push = (code: string, message: string, risk: ExceptionCase['risk']) => out.push({ code, message, risk });

  const std = ctx.vehicle?.standardAvg || ctx.vehicle?.fixedAvg || e.fixAvg || 0;

  // Low mileage
  if (std > 0 && calc.recdAvg > 0 && calc.recdAvg < std * (1 - RULES.tolerancePct))
    push('LOW_MILEAGE', `Mileage ${calc.recdAvg} km/l below standard ${std} km/l`, 'medium');

  // High consumption / implausible mileage
  if (calc.recdAvg > 0 && calc.recdAvg < RULES.minMileage)
    push('HIGH_CONSUMPTION', `Abnormally low mileage ${calc.recdAvg} km/l`, 'high');
  if (calc.recdAvg > RULES.maxMileage)
    push('METER_MISMATCH', `Implausibly high mileage ${calc.recdAvg} km/l — check odometer`, 'medium');

  // Capacity exceeded
  if (e.diesel > RULES.maxTankCapacity)
    push('CAPACITY_EXCEEDED', `Quantity ${e.diesel} L exceeds capacity ${RULES.maxTankCapacity} L`, 'high');

  // Missing receipt
  if (!e.hasReceipt)
    push('MISSING_RECEIPT', 'Receipt/register image not provided', 'low');

  // Odometer rollback
  if (e.currentReading > 0 && e.prevReading > 0 && e.currentReading < e.prevReading)
    push('ODOMETER_ROLLBACK', 'Current odometer lower than previous', 'high');

  // Vehicle filled more than allowed today
  const fillsToday = ctx.transactions.filter((t) => t.vehicleNo === norm(e.vehicleNo) && t.date === e.date).length;
  if (fillsToday >= RULES.maxDailyFillsPerVehicle)
    push('DOUBLE_FILL', `Vehicle already filled ${fillsToday} time(s) today`, 'medium');

  // Duplicate receipt
  if (e.billNo?.trim() && ctx.transactions.some((t) => t.billNo && t.billNo.trim().toLowerCase() === e.billNo.trim().toLowerCase()))
    push('DUP_RECEIPT', 'Duplicate receipt number', 'high');

  // Financial leakage — excess diesel debit
  if (calc.debitToDriver >= RULES.leakageDebitThreshold)
    push('FINANCIAL_LEAKAGE', `Excess diesel debit ₹${calc.debitToDriver} — possible leakage`, 'critical');
  else if (calc.excessDiesel > 0)
    push('EXCESS_DIESEL', `Excess ${calc.excessDiesel} L over standard`, 'medium');

  return out;
}

export function overallRisk(cases: ExceptionCase[]): ExceptionCase['risk'] | null {
  if (!cases.length) return null;
  const order = { low: 1, medium: 2, high: 3, critical: 4 } as const;
  return cases.reduce((m, c) => (order[c.risk] > order[m] ? c.risk : m), 'low' as ExceptionCase['risk']);
}
