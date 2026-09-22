import type { AuditActorType } from '@/lib/types';

/**
 * Append an entry to the audit_log table.
 * This is the single helper called after every meaningful action in the system.
 *
 * Uses the service role client to bypass RLS — audit entries are system-level records.
 * The audit_log table has no UPDATE or DELETE policies; entries are permanent.
 */
export async function logAction({
  supabase,
  applicationId,
  actorType,
  actorId,
  action,
  details,
}: {
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>;
  applicationId: string | null;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    application_id: applicationId,
    actor_type: actorType,
    actor_id: actorId,
    action,
    details: details ?? null,
  });

  if (error) {
    // Log but don't throw — audit logging should never break the primary operation
    console.error('[audit_log] Failed to write audit entry:', error.message, {
      applicationId,
      actorType,
      action,
    });
  }
}
