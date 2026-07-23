import { nextId, saveAudit } from './store';
import type { AuditLog } from './types';

// Persists to memory + Postgres. Await where the request must not race the write.
export async function logAudit(entry: Omit<AuditLog, 'id' | 'ts'>): Promise<void> {
  await saveAudit({ ...entry, id: nextId('A'), ts: new Date().toISOString() });
}
