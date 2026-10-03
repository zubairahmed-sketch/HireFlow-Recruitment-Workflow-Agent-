import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { draftEmail } from '@/lib/scoring/draftEmail';
import { logAction } from '@/lib/audit/logAction';
import { logTokenUsage } from '@/lib/openai/logTokenUsage';
import { z } from 'zod/v4';

/**
 * POST /api/emails/draft
 *
 * Call 2: Draft a rejection or interview-invite email.
 * Called by n8n to get a copy draft that a human has already approved indirectly
 * (by making the Approve/Reject decision). Draft is logged for auditability.
 *
 * Per Rule 2: The email is only sent by n8n's email nodes — never from here.
 * Per Rule 8: This is Call 2 of the 3 allowed LLM calls.
 */

const draftSchema = z.object({
  application_id: z.string().uuid(),
  decision_type: z.enum(['approved', 'rejected', 'more_info']),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = draftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { application_id, decision_type, notes } = parsed.data;
    const supabase = createServiceRoleClient();

    // Fetch candidate + job info
    const { data: application } = await supabase
      .from('applications')
      .select('id, candidate_id, job_posting_id, user_id')
      .eq('id', application_id)
      .single();

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const [candidateRes, jobRes] = await Promise.all([
      supabase.from('candidates').select('full_name').eq('id', application.candidate_id).single(),
      supabase.from('job_postings').select('title').eq('id', application.job_posting_id).single(),
    ]);

    // Call 2: Draft the email
    const result = await draftEmail({
      decisionType: decision_type,
      candidateName: candidateRes.data?.full_name ?? 'Candidate',
      jobTitle: jobRes.data?.title ?? 'Position',
      notes,
    });

    // Log token usage (Rule 11)
    await logTokenUsage({
      supabase,
      userId: application.user_id,
      callType: 'email_drafting',
      tokensUsed: result.tokensUsed,
    });

    // Audit log
    await logAction({
      supabase,
      applicationId: application_id,
      actorType: 'llm',
      actorId: 'gpt-4o-mini',
      action: 'email_draft_generated',
      details: {
        decision_type,
        subject: result.subject,
        tokens_used: result.tokensUsed,
      },
    });

    return NextResponse.json({
      data: {
        application_id,
        decision_type,
        subject: result.subject,
        body: result.body,
      },
    });
  } catch (err) {
    console.error('[email/draft] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
