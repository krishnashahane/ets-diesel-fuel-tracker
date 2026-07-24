// Neon Postgres persistence layer. Durable store for mutable data
// (new submissions, new/updated users, audit). Historical seed data stays in JSON.
import { neon } from '@neondatabase/serverless';
import type { Transaction, User, AuditLog, AppSettings } from './types';

export type MasterType = 'vehicles' | 'drivers' | 'pumps' | 'sites';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
export const pgEnabled = !!url;

// Lazily-created SQL client. Undefined when no DB configured (falls back to memory-only).
const sql = pgEnabled ? neon(url) : null;

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!sql) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS app_users (
        id text PRIMARY KEY,
        username text UNIQUE NOT NULL,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS app_transactions (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        data jsonb NOT NULL
      )`;
      // updated_at drives incremental sync: a warm instance polls only the rows
      // that changed since it last looked, instead of re-reading the whole table.
      await sql`ALTER TABLE app_transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`;
      await sql`CREATE INDEX IF NOT EXISTS app_transactions_updated_at_idx ON app_transactions (updated_at)`;
      await sql`CREATE TABLE IF NOT EXISTS app_audit (
        id text PRIMARY KEY,
        ts timestamptz NOT NULL DEFAULT now(),
        data jsonb NOT NULL
      )`;
      await sql`CREATE INDEX IF NOT EXISTS app_audit_ts_idx ON app_audit (ts)`;
      await sql`CREATE TABLE IF NOT EXISTS app_masters (
        mtype text NOT NULL,
        mkey text NOT NULL,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (mtype, mkey)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS app_settings (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      // Register page scans are stored once per batch and referenced by every
      // transaction extracted from them — never duplicated per row.
      await sql`CREATE TABLE IF NOT EXISTS app_register_pages (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by text NOT NULL DEFAULT '',
        data jsonb NOT NULL
      )`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

export async function loadUsers(): Promise<User[]> {
  if (!sql) return [];
  const rows = await sql`SELECT data FROM app_users` as { data: User }[];
  return rows.map((r) => r.data);
}
export async function loadTransactions(): Promise<Transaction[]> {
  if (!sql) return [];
  const rows = await sql`SELECT data FROM app_transactions ORDER BY created_at DESC` as { data: Transaction }[];
  return rows.map((r) => r.data);
}
export async function loadAudit(limit = 5000): Promise<AuditLog[]> {
  if (!sql) return [];
  const rows = await sql`SELECT data FROM app_audit ORDER BY ts DESC LIMIT ${limit}` as { data: AuditLog }[];
  return rows.map((r) => r.data);
}

export async function loadSettings(): Promise<AppSettings | null> {
  if (!sql) return null;
  const rows = await sql`SELECT data FROM app_settings WHERE id = 'app'` as { data: AppSettings }[];
  return rows[0]?.data ?? null;
}
export async function saveSettingsRow(s: AppSettings): Promise<void> {
  if (!sql) return;
  await sql`INSERT INTO app_settings (id, data, updated_at) VALUES ('app', ${JSON.stringify(s)}, now())
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}

export async function loadMasters(): Promise<{ mtype: MasterType; data: unknown }[]> {
  if (!sql) return [];
  const rows = await sql`SELECT mtype, data FROM app_masters` as { mtype: MasterType; data: unknown }[];
  return rows;
}
export async function upsertMaster(mtype: MasterType, mkey: string, data: unknown): Promise<void> {
  if (!sql) return;
  await sql`INSERT INTO app_masters (mtype, mkey, data, updated_at)
            VALUES (${mtype}, ${mkey}, ${JSON.stringify(data)}, now())
            ON CONFLICT (mtype, mkey) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}

export async function upsertUser(u: User): Promise<void> {
  if (!sql) return;
  await sql`INSERT INTO app_users (id, username, data, updated_at)
            VALUES (${u.id}, ${u.username}, ${JSON.stringify(u)}, now())
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, username = EXCLUDED.username, updated_at = now()`;
}
export async function insertTransaction(t: Transaction): Promise<void> {
  if (!sql) return;
  const created = t.createdAt || new Date().toISOString();
  // updated_at is always bumped so other instances pick the row up on their next sync.
  await sql`INSERT INTO app_transactions (id, created_at, updated_at, data)
            VALUES (${t.id}, ${created}, now(), ${JSON.stringify(t)})
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}

/**
 * Incremental sync feed. Returns every transaction touched since `since`, plus the
 * database's own clock to use as the next watermark — using the DB clock rather
 * than the instance's avoids drift between serverless instances.
 */
export async function loadTransactionsSince(since: string): Promise<{ rows: Transaction[]; now: string }> {
  if (!sql) return { rows: [], now: new Date().toISOString() };
  const [rowsRes, clockRes] = await Promise.all([
    sql`SELECT data FROM app_transactions WHERE updated_at > ${since} ORDER BY updated_at ASC`,
    sql`SELECT now() AS now`,
  ]);
  const rows = rowsRes as { data: Transaction }[];
  const clock = clockRes as { now: string }[];
  return { rows: rows.map((r) => r.data), now: new Date(clock[0].now).toISOString() };
}

export async function loadAuditSince(since: string, limit = 2000): Promise<AuditLog[]> {
  if (!sql) return [];
  const rows = await sql`SELECT data FROM app_audit WHERE ts > ${since} ORDER BY ts DESC LIMIT ${limit}` as { data: AuditLog }[];
  return rows.map((r) => r.data);
}
export interface RegisterPage {
  id: string;
  image: string;          // data URL of the register page photo
  text: string;           // raw OCR text (evidence trail)
  ocrConfidence: number;
  rowCount: number;
  createdAt: string;
  createdBy: string;
}
export async function insertRegisterPage(p: RegisterPage): Promise<void> {
  if (!sql) return;
  await sql`INSERT INTO app_register_pages (id, created_at, created_by, data)
            VALUES (${p.id}, ${p.createdAt}, ${p.createdBy}, ${JSON.stringify(p)})
            ON CONFLICT (id) DO NOTHING`;
}
export async function loadRegisterPage(id: string): Promise<RegisterPage | null> {
  if (!sql) return null;
  const rows = await sql`SELECT data FROM app_register_pages WHERE id = ${id}` as { data: RegisterPage }[];
  return rows[0]?.data ?? null;
}

export async function insertAudit(a: AuditLog): Promise<void> {
  if (!sql) return;
  await sql`INSERT INTO app_audit (id, ts, data)
            VALUES (${a.id}, ${a.ts}, ${JSON.stringify(a)})
            ON CONFLICT (id) DO NOTHING`;
}
