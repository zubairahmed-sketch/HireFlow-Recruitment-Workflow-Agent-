/**
 * Append-only audit log helper — uses Drizzle ORM.
 * Called after every meaningful action in the system.
 */

import { getDb } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

export async function logAction({
  applicationId,
  actorType,
  actorId,
  action,
  details,
}: {
  applicationId: string;
  actorType: 'system' | 'llm' | 'human';
  actorId: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  try {
    const db = getDb();
    await db.insert(auditLog).values({
      applicationId,
      actorType,
      actorId,
      action,
      details: details ?? null,
    });
  } catch (err) {
    console.error('[audit] Failed to log action:', err);
    // Audit logging should never crash the calling operation
  }
}
