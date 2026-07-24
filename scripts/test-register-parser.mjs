// Accuracy harness for the register-sheet parser.
// Runs realistic OCR output (including typical Tesseract glyph errors) through the
// parser and asserts the extracted fields. Run: node scripts/test-register-parser.mjs
import { pathToFileURL } from 'node:url';

// register.ts is dependency-free and type-only at the boundaries, so Node's
// built-in type stripping (Node >= 22.6) imports it directly — no build step.
const R = await import(pathToFileURL(`${process.cwd()}/src/lib/register.ts`).href);

const VEHICLES = ['MH14LB9060', 'MH12QR4501', 'MH14GH2233', 'MH04CD1188', 'MH14LB9061'];
const PUMPS = ['JAYHIND', 'BHARAT PETROLEUM', 'Tanker Chakan', 'HP RANJANGAON'];
const DRIVERS = ['Ramesh Pawar', 'Suresh Jadhav', 'Anil Kamble'];
const ctx = { vehicles: VEHICLES, drivers: DRIVERS, pumps: PUMPS };

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected || (typeof expected === 'number' && Math.abs((actual ?? 0) - expected) < 0.011);
  if (ok) pass++;
  else { fail++; console.log(`  ✗ ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
};

function run(label, line, expect, opts = {}) {
  const row = R.parseRegisterLine(line, 1, ctx, opts);
  console.log(`\n${label}`);
  for (const [k, v] of Object.entries(expect)) check(k, row[k], v);
}

// --- 1. Clean, well-separated columns --------------------------------------
run('clean row', '12/07/2026  MH14LB9060  Ramesh Pawar  JAYHIND  85.50  94.20  8054.10  128456',
  { date: '2026-07-12', vehicleNo: 'MH14LB9060', diesel: 85.5, rate: 94.2, amount: 8054.1, currentReading: 128456, pump: 'JAYHIND', driverName: 'Ramesh Pawar' });

// --- 2. Typical OCR glyph confusion in the plate ---------------------------
run('plate with O/0 and S/5 confusion', '13-07-2026 MHI4LB9O6O JAYHIND 60 94.20 5652 129001',
  { vehicleNo: 'MH14LB9060', diesel: 60, rate: 94.2, currentReading: 129001 });

// --- 3. Labelled columns ---------------------------------------------------
run('labelled columns', 'Date 14/07/26 Bus MH12QR4501 Qty 72.4 Rate 94.20 Amt 6820.08 KM 45120',
  { date: '2026-07-14', vehicleNo: 'MH12QR4501', diesel: 72.4, rate: 94.2, currentReading: 45120 });

// --- 4. No amount column: identity cannot be used, windows must ------------
run('no amount column', '15/07/2026 MH14GH2233 Tanker Chakan 55 94.2 76890',
  { vehicleNo: 'MH14GH2233', diesel: 55, rate: 94.2, currentReading: 76890, pump: 'Tanker Chakan' });

// --- 5. Missing rate, amount present: rate is derived ----------------------
run('derive rate from amount', '16/07/2026 MH04CD1188 40 3768 55210',
  { vehicleNo: 'MH04CD1188', diesel: 40, amount: 3768, rate: 94.2, currentReading: 55210 });

// --- 6. Thousands separators and rupee symbol ------------------------------
run('separators and symbols', '17/07/2026 MH14LB9061 Qty 100 Rate 94.20 Amount Rs 9,420.00 Odo 1,28,999',
  { vehicleNo: 'MH14LB9061', diesel: 100, rate: 94.2, amount: 9420 });

// --- 7. Page-level date applied to a row that has none ---------------------
run('date defaulted', 'MH14LB9060 JAYHIND 45 94.20 4239 130500',
  { date: '2026-07-20', vehicleNo: 'MH14LB9060', diesel: 45, currentReading: 130500 },
  { defaultDate: '2026-07-20' });

// --- 8. Fuzzy pump name (OCR dropped a letter) -----------------------------
run('fuzzy pump name', '18/07/2026 MH14LB9060 JAYHIN 50 94.20 4710 131000',
  { vehicleNo: 'MH14LB9060', pump: 'JAYHIND', diesel: 50 });

// --- 9. Whole page: headers and totals must be discarded -------------------
const PAGE = `DIESEL REGISTER - CHAKAN YARD   DATE: 12/07/2026
Sr Date Bus No Driver Pump Qty Rate Amount KM Reading
1 12/07/2026 MH14LB9060 Ramesh Pawar JAYHIND 85.50 94.20 8054.10 128456
2 12/07/2026 MH12QR4501 Suresh Jadhav JAYHIND 72.40 94.20 6820.08 45120
3 12/07/2026 MHI4GH2233 Anil Kamble Tanker Chakan 55.00 94.20 5181.00 76890
TOTAL 212.90 20055.18
Signature ______`;
const rows = R.parseRegisterText(PAGE, ctx);
console.log('\nfull page');
check('row count', rows.length, 3);
check('row1 vehicle', rows[0]?.vehicleNo, 'MH14LB9060');
check('row2 diesel', rows[1]?.diesel, 72.4);
check('row3 vehicle (OCR-corrected)', rows[2]?.vehicleNo, 'MH14GH2233');
check('row3 odometer', rows[2]?.currentReading, 76890);
check('header date inherited', rows[0]?.date, '2026-07-12');

// --- 10. Mandatory-field gate ---------------------------------------------
console.log('\nmandatory gate');
check('complete row passes', R.missingRequired({ diesel: 50, currentReading: 1000, vehicleNo: 'MH14LB9060', pump: 'JAYHIND' }).length, 0);
check('missing odometer caught', R.missingRequired({ diesel: 50, currentReading: 0, vehicleNo: 'MH14LB9060', pump: 'JAYHIND' })[0], 'Odometer Reading');
check('missing all caught', R.missingRequired({}).length, 4);

// --- 11. Vehicle snapping ---------------------------------------------------
console.log('\nvehicle snapping');
check('exact', R.snapVehicle('MH14LB9060', VEHICLES), 'MH14LB9060');
check('spaced', R.snapVehicle('MH 14 LB 9060', VEHICLES), 'MH14LB9060');
check('glyph confusion', R.snapVehicle('MHI4LB9O6O', VEHICLES), 'MH14LB9060');
check('unknown stays unknown', R.snapVehicle('XX99ZZ0000', VEHICLES), undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
