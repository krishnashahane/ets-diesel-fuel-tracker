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
      await sql`CREATE TABLE IF NOT EXISTS app_audit (
        id text PRIMARY KEY,
        ts timestamptz NOT NULL DEFAULT now(),
        data jsonb NOT NULL
      )`;
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
  await sql`INSERT INTO app_transactions (id, created_at, data)
            VALUES (${t.id}, ${created}, ${JSON.stringify(t)})
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
}
export async function insertAudit(a: AuditLog): Promise<void> {
  if (!sql) return;
  await sql`INSERT INTO app_audit (id, ts, data)
            VALUES (${a.id}, ${a.ts}, ${JSON.stringify(a)})
            ON CONFLICT (id) DO NOTHING`;
}
