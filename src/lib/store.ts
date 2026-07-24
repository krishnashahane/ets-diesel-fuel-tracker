// Data layer. Static reference data + historical records are seeded from bundled JSON.
// Mutable data (new submissions, new/updated users, audit) is persisted to Neon Postgres
// via src/lib/pg.ts and merged over the seeds on cold start. If no DB is configured the
// layer degrades to in-memory only (writes survive within a warm instance).
import type { User, Vehicle, Driver, Pump, Site, Transaction, AuditLog, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import usersSeed from '@/data/users.json';
import vehiclesSeed from '@/data/vehicles.json';
import driversSeed from '@/data/drivers.json';
import pumpsSeed from '@/data/pumps.json';
import sitesSeed from '@/data/sites.json';
import txSeed from '@/data/transactions.seed.json';
import {
  pgEnabled, ensureSchema, loadUsers, loadTransactions, loadAudit, loadMasters, loadSettings,
  upsertUser, insertTransaction, insertAudit, upsertMaster, saveSettingsRow,
  insertRegisterPage, loadRegisterPage, type MasterType, type RegisterPage,
} from './pg';

// Key used to identify a master record (vehicles by number, others by id).
export function masterKey(type: MasterType, rec: Record<string, unknown>): string {
  return type === 'vehicles' ? String(rec.vehicleNo) : String(rec.id);
}

interface DB {
  users: User[];
  vehicles: Vehicle[];
  drivers: Driver[];
  pumps: Pump[];
  sites: Site[];
  transactions: Transaction[];
  audit: AuditLog[];
  settings: AppSettings;
  seq: number;
}

const g = globalThis as unknown as { __SFM_DB?: DB; __SFM_READY?: Promise<void> };

function seedDb(): DB {
  return {
    users: structuredClone(usersSeed as User[]),
    vehicles: structuredClone(vehiclesSeed as Vehicle[]),
    drivers: structuredClone(driversSeed as Driver[]),
    pumps: structuredClone(pumpsSeed as Pump[]),
    sites: structuredClone(sitesSeed as Site[]),
    transactions: structuredClone(txSeed as Transaction[]),
    audit: [],
    settings: { ...DEFAULT_SETTINGS },
    seq: 1,
  };
}

// Merge persisted Postgres rows over the JSON seeds. Idempotent per cold start.
async function hydrate(d: DB): Promise<void> {
  if (!pgEnabled) return;
  await ensureSchema();
  const [dbUsers, dbTx, dbAudit, dbMasters, dbSettings] = await Promise.all([
    loadUsers(), loadTransactions(), loadAudit(), loadMasters(), loadSettings(),
  ]);
  if (dbSettings) d.settings = { ...DEFAULT_SETTINGS, ...dbSettings };
  // Users: persisted rows override/append seed users (handles resets, deactivations, new users).
  for (const u of dbUsers) {
    const i = d.users.findIndex((x) => x.id === u.id || x.username.toLowerCase() === u.username.toLowerCase());
    if (i >= 0) d.users[i] = u; else d.users.push(u);
  }
  // Transactions: persisted rows override matching seeds (status changes survive);
  // brand-new submissions are prepended so they surface first.
  const seedIds = new Set(d.transactions.map((t) => t.id));
  const dbById = new Map(dbTx.map((t) => [t.id, t]));
  const merged = d.transactions.map((t) => dbById.get(t.id) ?? t);
  const newOnes = dbTx.filter((t) => !seedIds.has(t.id));
  d.transactions = [...newOnes, ...merged];
  // Audit lives only in the DB.
  d.audit = dbAudit;
  // Masters: persisted additions/edits override matching seeds, new ones prepended.
  for (const { mtype, data } of dbMasters) {
    const arr = d[mtype] as unknown as Record<string, unknown>[];
    const key = masterKey(mtype, data as Record<string, unknown>);
    const i = arr.findIndex((x) => masterKey(mtype, x) === key);
    if (i >= 0) arr[i] = data as never; else arr.unshift(data as never);
  }
}

// Ensures the singleton is initialised and hydrated exactly once per instance.
export async function ensureDb(): Promise<DB> {
  if (!g.__SFM_DB) g.__SFM_DB = seedDb();
  if (!g.__SFM_READY) {
    g.__SFM_READY = hydrate(g.__SFM_DB).catch((e) => {
      // Never hard-fail requests on DB hiccups; keep serving from memory/seeds.
      g.__SFM_READY = undefined;
      console.error('DB hydrate failed:', e);
    });
  }
  await g.__SFM_READY;
  return g.__SFM_DB;
}

// Synchronous accessor — callers must have awaited ensureDb() earlier in the request.
export function db(): DB {
  if (!g.__SFM_DB) g.__SFM_DB = seedDb();
  return g.__SFM_DB;
}

export function nextId(prefix: string): string {
  const d = db();
  return `${prefix}${Date.now().toString(36)}${(d.seq++).toString(36)}`;
}

// Write-through helpers: mutate memory AND persist. Persistence failures are logged,
// never thrown, so the request still succeeds against the warm in-memory copy.
export async function saveTransaction(t: Transaction): Promise<void> {
  db().transactions.unshift(t);
  try { await insertTransaction(t); } catch (e) { console.error('persist tx failed:', e); }
}
// Persist an in-place mutation of an existing transaction (status advance, reject).
export async function saveTransactionUpdate(t: Transaction): Promise<void> {
  try { await insertTransaction(t); } catch (e) { console.error('persist tx update failed:', e); }
}
export async function saveNewUser(u: User): Promise<void> {
  db().users.push(u);
  try { await upsertUser(u); } catch (e) { console.error('persist user failed:', e); }
}
export async function saveUserUpdate(u: User): Promise<void> {
  try { await upsertUser(u); } catch (e) { console.error('persist user update failed:', e); }
}
// Persist a new or edited master record (vehicle/driver/pump/site).
export async function saveMaster(type: MasterType, rec: Record<string, unknown>): Promise<void> {
  try { await upsertMaster(type, masterKey(type, rec), rec); } catch (e) { console.error('persist master failed:', e); }
}
export async function saveAudit(a: AuditLog): Promise<void> {
  const d = db();
  d.audit.unshift(a);
  if (d.audit.length > 5000) d.audit.length = 5000;
  try { await insertAudit(a); } catch (e) { console.error('persist audit failed:', e); }
}

// Register page scans: persisted once per batch, fetched on demand. Kept OUT of the
// hydrated in-memory DB — a warm instance must never hold N megabytes of scans.
// A small bounded cache covers the no-Postgres (memory-only) deployment.
const REG_CACHE_MAX = 12;
function regCache(): Map<string, RegisterPage> {
  const gg = globalThis as unknown as { __SFM_REG?: Map<string, RegisterPage> };
  return (gg.__SFM_REG ??= new Map());
}
export async function saveRegisterPage(p: RegisterPage): Promise<void> {
  const c = regCache();
  c.set(p.id, p);
  while (c.size > REG_CACHE_MAX) c.delete(c.keys().next().value as string);
  try { await insertRegisterPage(p); } catch (e) { console.error('persist register page failed:', e); }
}
export async function getRegisterPage(id: string): Promise<RegisterPage | null> {
  const cached = regCache().get(id);
  if (cached) return cached;
  try { return await loadRegisterPage(id); } catch (e) { console.error('load register page failed:', e); return null; }
}

export function getSettings(): AppSettings {
  return db().settings;
}
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const d = db();
  d.settings = { ...d.settings, ...patch };
  try { await saveSettingsRow(d.settings); } catch (e) { console.error('persist settings failed:', e); }
  return d.settings;
}

// Full snapshot of persisted (mutable) data for backup/export.
export function snapshot() {
  const d = db();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: d.settings,
    users: d.users,
    transactions: d.transactions,
    masters: { vehicles: d.vehicles, drivers: d.drivers, pumps: d.pumps, sites: d.sites },
    audit: d.audit,
  };
}

// Restore from a snapshot: write everything through to Postgres, then re-hydrate.
export async function restore(snap: ReturnType<typeof snapshot>): Promise<{ users: number; transactions: number; masters: number }> {
  const d = db();
  let masters = 0;
  if (snap.settings) await updateSettings(snap.settings);
  for (const u of snap.users || []) await saveUserUpdate(u);
  for (const t of snap.transactions || []) { try { await insertTransaction(t); } catch { /* skip */ } }
  const m = (snap.masters || {}) as unknown as Record<MasterType, Record<string, unknown>[]>;
  for (const type of ['vehicles', 'drivers', 'pumps', 'sites'] as MasterType[]) {
    for (const rec of m[type] || []) { await saveMaster(type, rec); masters++; }
  }
  // Refresh in-memory model from DB so the restore is immediately visible.
  g.__SFM_READY = undefined;
  await ensureDb();
  return { users: (snap.users || []).length, transactions: (snap.transactions || []).length, masters };
}
