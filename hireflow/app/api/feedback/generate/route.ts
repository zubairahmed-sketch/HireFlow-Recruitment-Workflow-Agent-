import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateFeedbackSummary } from '@/lib/feedback/generateSummary';
import { logAction } from '@/lib/audit/logAction';
import { logTokenUsage } from '@/lib/openai/logTokenUsage';
import { z } from 'zod/v4';

/**
 * POST /api/feedback/generate
 *
 * Called by n8n after an interview stage completes.
 * Generates a structured feedback summary (Call 3) from interview notes.
 * Stores the result in feedback_summaries.
 */

const feedbackSchema = z.object({
  application_id: z.string().uuid(),
  interview_notes: z.string().min(1, 'Interview notes are required'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { application_id, interview_notes } = parsed.data;
    const serviceClient = createServiceRoleClient();

    // Fetch application + candidate + job info
    const { data: application } = await serviceClient
      .from('applications')
      .select('id, candidate_id, job_posting_id, user_id')
      .eq('id', application_id)
      .single();

    if (!application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    const [candidateRes, jobRes] = await Promise.all([
      serviceClient
        .from('candidates')
        .select('full_name')
        .eq('id', application.candidate_id)
        .single(),
      serviceClient
        .from('job_postings')
        .select('title')
        .eq('id', application.job_posting_id)
        .single(),
    ]);

    // Call 3: Generate feedback summary
    const result = await generateFeedbackSummary({
      interviewNotes: interview_notes,
      candidateName: candidateRes.data?.full_name ?? 'Candidate',
      jobTitle: jobRes.data?.title ?? 'Position',
    });

    // Store in feedback_summaries
    const { data: summaryRecord, error: insertError } = await serviceClient
      .from('feedback_summaries')
      .insert({
        application_id,
        summary_text: result.summary_text,
      })
      .select('id, generated_at')
      .single();

    if (insertError) {
      console.error('[feedback] Insert error:', insertError.message);
      return NextResponse.json(
        { error: 'Failed to store feedback summary' },
        { status: 500 }
      );
    }

    // Log token usage (Rule 11)
    await logTokenUsage({
      supabase: serviceClient,
      userId: application.user_id,
      callType: 'feedback_summary',
      tokensUsed: result.tokensUsed,
    });

    // Audit log
    await logAction({
      supabase: serviceClient,
      applicationId: application_id,
      actorType: 'llm',
      actorId: 'gpt-4o-mini',
      action: 'feedback_summary_generated',
      details: {
        summary_id: summaryRecord.id,
        tokens_used: result.tokensUsed,
      },
    });

    return NextResponse.json({
      data: {
        summary_id: summaryRecord.id,
        application_id,
        summary_text: result.summary_text,
        generated_at: summaryRecord.generated_at,
      },
    });
  } catch (err) {
    console.error('[feedback] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
