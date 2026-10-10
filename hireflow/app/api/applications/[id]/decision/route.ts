import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { applications, humanDecisions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * POST /api/applications/[id]/decision
 *
 * Records a human decision (approve/reject/more_info), updates application status,
 * then calls n8n's resume URL to unfreeze the paused workflow.
 *
 * This is the bridge between human review and n8n orchestration.
 */

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'more_info']),
  notes: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: applicationId } = await params;
    const body = await request.json();
    const parsed = decisionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { decision, notes } = parsed.data;
    const db = getDb();

    // 1. Verify application exists and get resume URL
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // 2. Record the human decision
    const [decisionRecord] = await db
      .insert(humanDecisions)
      .values({
        applicationId,
        decidedBy: userId,
        decision,
        notes: notes ?? null,
      })
      .returning();

    // 3. Update application status
    await db
      .update(applications)
      .set({ status: decision })
      .where(eq(applications.id, applicationId));

    // 4. Audit log
    await logAction({
      applicationId,
      actorType: 'human',
      actorId: userId,
      action: 'decision_recorded',
      details: {
        decision,
        decision_id: decisionRecord.id,
        notes: notes ?? null,
      },
    });

    // 5. Resume n8n workflow (the most important step)
    if (application.n8nResumeUrl) {
      try {
        const n8nResponse = await fetch(application.n8nResumeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, notes, application_id: applicationId }),
        });

        await logAction({
          applicationId,
          actorType: 'system',
          actorId: 'api:decision',
          action: 'n8n_workflow_resumed',
          details: {
            resume_url: application.n8nResumeUrl,
            n8n_status: n8nResponse.status,
          },
        });
      } catch (n8nErr) {
        console.error('[decision] Failed to resume n8n:', n8nErr);
        await logAction({
          applicationId,
          actorType: 'system',
          actorId: 'api:decision',
          action: 'n8n_resume_failed',
          details: {
            error: n8nErr instanceof Error ? n8nErr.message : 'Unknown error',
          },
        });
      }
    }

    return NextResponse.json({
      data: {
        decision_id: decisionRecord.id,
        application_id: applicationId,
        decision,
        status: decision,
      },
    });
  } catch (err) {
    console.error('[decision] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
