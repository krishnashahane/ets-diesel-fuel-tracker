// Deterministic fuel business calculations. No AI/LLM.
export interface CalcInput {
  diesel: number;        // litres filled
  rate: number;          // price per litre
  currentReading: number;
  prevReading: number;
  fixAvg: number;        // standard/fixed avg km per litre
}

export interface CalcResult {
  amount: number;
  totalKm: number;
  recdAvg: number;       // achieved mileage km/l
  actualQty: number;     // standard litres required for distance
  excessDiesel: number;  // filled - required
  debitToDriver: number; // value of excess diesel
  costPerKm: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calculate(i: CalcInput): CalcResult {
  const totalKm = Math.max(0, r2(i.currentReading - i.prevReading));
  const amount = r2(i.diesel * i.rate);
  const recdAvg = i.diesel > 0 ? r2(totalKm / i.diesel) : 0;
  const actualQty = i.fixAvg > 0 ? r2(totalKm / i.fixAvg) : 0;
  const excessDiesel = r2(i.diesel - actualQty);
  const debitToDriver = excessDiesel > 0 ? r2(excessDiesel * i.rate) : 0;
  const costPerKm = totalKm > 0 ? r2(amount / totalKm) : 0;
  return { amount, totalKm, recdAvg, actualQty, excessDiesel, debitToDriver, costPerKm };
}
