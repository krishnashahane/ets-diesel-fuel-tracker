// Parse source CSVs -> normalized seed JSON. Rule-based, no AI.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('diesel_csv_export');
const OUT = path.resolve('src/data');
fs.mkdirSync(OUT, { recursive: true });

// Minimal RFC4180-ish CSV parser (handles quoted commas/newlines).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const s = (v) => String(v ?? '').trim();

// ---- Vehicle master (VEHICLE_WISE) ----
const vwText = fs.readFileSync(path.join(SRC, 'DIESEL_DEBIT_WORKING_JUNE_2026/VEHICLE_WISE_DIESEL_DEBIT_JUNE.csv'), 'utf8');
const vwRows = parseCSV(vwText);
// header at index 1
const vehicles = [];
const vehSeen = new Set();
for (let i = 2; i < vwRows.length; i++) {
  const r = vwRows[i];
  const no = s(r[1]).toUpperCase().replace(/\s+/g, '');
  if (!no || vehSeen.has(no)) continue;
  vehSeen.add(no);
  vehicles.push({
    vehicleNo: no,
    seatingCap: num(r[2]) || null,
    ac: /non/i.test(s(r[3])) ? 'Non A/C' : (s(r[3]) ? 'A/C' : ''),
    fuel: s(r[4]) || 'Diesel',
    make: s(r[5]) || '',
    ownership: s(r[6]) || '',
    costCenter: s(r[7]) || '',
    standardAvg: num(r[8]) || null,
    fixedAvg: num(r[9]) || null,
    active: true,
  });
}

// ---- Transactions (June-26) ----
const jText = fs.readFileSync(path.join(SRC, 'Diesel_Data_June-26/June-26.csv'), 'utf8');
const jRows = parseCSV(jText);
// header at index 2
const tx = [];
const drivers = new Map(); // name -> count
const pumps = new Map();
const sites = new Map(); // CO -> count
for (let i = 3; i < jRows.length; i++) {
  const r = jRows[i];
  const veh = s(r[6]).toUpperCase().replace(/\s+/g, '');
  const diesel = num(r[9]);
  if (!veh && !diesel) continue;
  const driver = s(r[5]);
  const pump = s(r[4]);
  const co = s(r[3]);
  if (driver) drivers.set(driver, (drivers.get(driver) || 0) + 1);
  if (pump) pumps.set(pump, (pumps.get(pump) || 0) + 1);
  if (co) sites.set(co, (sites.get(co) || 0) + 1);
  tx.push({
    id: `J${i}`,
    billNo: s(r[0]),
    srNo: num(r[1]),
    date: s(r[2]).slice(0, 10),
    co,
    pump,
    driverName: driver,
    vehicleNo: veh,
    fixAvg: num(r[8]),
    diesel,
    rate: num(r[10]),
    amount: num(r[11]),
    currentReading: num(r[12]),
    prevReading: num(r[13]),
    totalKm: num(r[14]),
    recdAvg: num(r[15]),
    actualQty: num(r[16]),
    excessDiesel: num(r[17]),
    debitToDriver: num(r[18]),
    remarks: s(r[19]),
    fillingLocation: s(r[20]),
    fuelType: 'Diesel',
    source: 'pump',
    status: 'Locked',
  });
}

const driverList = [...drivers.keys()].filter(Boolean).sort().map((name, i) => ({
  id: `D${i + 1}`, name, licenseNo: '', active: true,
}));
const pumpList = [...pumps.keys()].filter(Boolean).sort().map((name, i) => ({
  id: `P${i + 1}`, name: name.trim(), active: true,
}));
const siteList = [...sites.keys()].filter(Boolean).sort().map((name, i) => ({
  id: `S${i + 1}`, name, active: true,
}));

const write = (f, d) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(d));
write('vehicles.json', vehicles);
write('drivers.json', driverList);
write('pumps.json', pumpList);
write('sites.json', siteList);
write('transactions.seed.json', tx);

console.log(`vehicles=${vehicles.length} drivers=${driverList.length} pumps=${pumpList.length} sites=${siteList.length} tx=${tx.length}`);
