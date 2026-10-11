import { NextResponse } from 'next/server';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * POST /api/interviews/reminders/log
 * Called by n8n after sending a reminder email. Writes to audit_log.
 */

const logSchema = z.object({
  application_id: z.string().uuid(),
  action: z.enum(['reminder_sent']),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = logSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { application_id, action } = parsed.data;

    await logAction({
      applicationId: application_id,
      actorType: 'system',
      actorId: 'n8n:reminder-workflow',
      action,
      details: { sent_at: new Date().toISOString() },
    });

    return NextResponse.json({ data: { logged: true } });
  } catch (err) {
    console.error('[reminders/log] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
