import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * POST /api/applications/[id]/decision
 * 
 * Records a human decision (approve/reject/more_info) and then calls
 * n8n's resume-webhook to unfreeze the paused workflow.
 * 
 * This is the bridge between the human review UI and n8n's Wait node.
 * Three things happen in order:
 * 1. Insert into human_decisions
 * 2. Log to audit_log
 * 3. Call the saved n8n_resume_url with the decision value
 * 
 * Per Rule 2: The decision is always a real human action, never an LLM output.
 * Per Rule 4: This triggers n8n's real Wait-for-Webhook resume, not polling.
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
    const { id: applicationId } = await params;
    const supabase = await createClient();

    // 1. Authenticate the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate the decision
    const body = await request.json();
    const parsed = decisionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { decision, notes } = parsed.data;

    // Use service role client for cross-table writes
    const serviceClient = createServiceRoleClient();

    // 3. Verify the application exists and is in a reviewable state
    const { data: application, error: appError } = await serviceClient
      .from('applications')
      .select('id, status, n8n_resume_url, user_id')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    if (application.status !== 'pending_review' && application.status !== 'more_info') {
      return NextResponse.json(
        {
          error: `Application is in '${application.status}' status and cannot be reviewed right now`,
        },
        { status: 409 }
      );
    }

    // 4. Insert the human decision
    const { data: decisionRecord, error: decisionError } = await serviceClient
      .from('human_decisions')
      .insert({
        application_id: applicationId,
        decided_by: user.id,
        decision,
        notes: notes ?? null,
      })
      .select('id, decided_at')
      .single();

    if (decisionError || !decisionRecord) {
      console.error('[decision] Failed to record decision:', decisionError?.message);
      return NextResponse.json(
        { error: 'Failed to record decision' },
        { status: 500 }
      );
    }

    // 5. Update application status
    const statusMap: Record<string, string> = {
      approved: 'approved',
      rejected: 'rejected',
      more_info: 'more_info',
    };

    const { error: updateError } = await serviceClient
      .from('applications')
      .update({ status: statusMap[decision] })
      .eq('id', applicationId);

    if (updateError) {
      console.error('[decision] Failed to update status:', updateError.message);
    }

    // 6. Audit log
    await logAction({
      supabase: serviceClient,
      applicationId,
      actorType: 'human',
      actorId: user.id,
      action: 'decision_recorded',
      details: {
        decision,
        notes: notes ?? null,
        decision_id: decisionRecord.id,
        decided_at: decisionRecord.decided_at,
      },
    });

    // 7. Resume the n8n workflow by calling the saved resume URL
    let n8nResumed = false;
    if (application.n8n_resume_url) {
      try {
        const n8nResponse = await fetch(application.n8n_resume_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            application_id: applicationId,
            decided_by: user.id,
            notes: notes ?? null,
          }),
        });
        n8nResumed = n8nResponse.ok;

        if (!n8nResumed) {
          console.error(
            '[decision] n8n resume call failed:',
            n8nResponse.status,
            await n8nResponse.text()
          );
        }

        // Audit the n8n resume attempt
        await logAction({
          supabase: serviceClient,
          applicationId,
          actorType: 'system',
          actorId: 'api:decision',
          action: 'n8n_workflow_resumed',
          details: {
            resume_url: application.n8n_resume_url,
            success: n8nResumed,
            decision,
          },
        });
      } catch (n8nErr) {
        console.error('[decision] Failed to call n8n resume URL:', n8nErr);
        // Don't fail the decision recording — the decision is saved even if n8n is down
        await logAction({
          supabase: serviceClient,
          applicationId,
          actorType: 'system',
          actorId: 'api:decision',
          action: 'n8n_workflow_resume_failed',
          details: {
            resume_url: application.n8n_resume_url,
            error: String(n8nErr),
          },
        });
      }
    }

    return NextResponse.json({
      data: {
        application_id: applicationId,
        decision,
        decision_id: decisionRecord.id,
        decided_at: decisionRecord.decided_at,
        n8n_resumed: n8nResumed,
      },
    });
  } catch (err) {
    console.error('[decision] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
