import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { scoreResume } from '@/lib/scoring/scoreResume';
import { logAction } from '@/lib/audit/logAction';
import { logTokenUsage } from '@/lib/openai/logTokenUsage';
import { z } from 'zod/v4';
import type { JobCriterion } from '@/lib/types';

/**
 * POST /api/applications/score
 * 
 * Called by n8n after resume text has been extracted.
 * Assembles the job's criteria + resume text, calls the LLM (Call 1),
 * stores the structured score, and sets status to 'pending_review'.
 * 
 * Per Rule 2: Returns a structured recommendation ONLY — never triggers
 *             any candidate-facing action.
 * Per Rule 3: Always returns full structured output with evidence per criterion.
 */

const scoreSchema = z.object({
  application_id: z.string().uuid('Valid application ID is required'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = scoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { application_id } = parsed.data;
    const supabase = createServiceRoleClient();

    // 1. Fetch the application with its resume text and job posting criteria
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, resume_text, job_posting_id, user_id, status')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    if (!application.resume_text) {
      return NextResponse.json(
        { error: 'Resume text has not been extracted yet. Call /api/applications/extract first.' },
        { status: 400 }
      );
    }

    // 2. Fetch the job posting's criteria
    const { data: jobPosting, error: jobError } = await supabase
      .from('job_postings')
      .select('criteria')
      .eq('id', application.job_posting_id)
      .single();

    if (jobError || !jobPosting) {
      return NextResponse.json(
        { error: 'Associated job posting not found' },
        { status: 404 }
      );
    }

    const criteria = jobPosting.criteria as JobCriterion[];

    // 3. Call the LLM for structured scoring (Call 1)
    const scoringResult = await scoreResume({
      criteria,
      resumeText: application.resume_text,
    });

    // 4. Store the score in resume_scores
    const { data: scoreRecord, error: scoreError } = await supabase
      .from('resume_scores')
      .insert({
        application_id,
        criteria_results: scoringResult.criteria_results,
        overall_score: scoringResult.overall_score,
        recommendation: scoringResult.recommendation,
      })
      .select('id')
      .single();

    if (scoreError || !scoreRecord) {
      console.error('[score] Failed to store score:', scoreError?.message);
      return NextResponse.json(
        { error: 'Failed to store scoring result' },
        { status: 500 }
      );
    }

    // 5. Update application status to 'pending_review'
    const { error: updateError } = await supabase
      .from('applications')
      .update({ status: 'pending_review' })
      .eq('id', application_id);

    if (updateError) {
      console.error('[score] Failed to update status:', updateError.message);
    }

    // 6. Log token usage (Rule 11)
    await logTokenUsage({
      supabase,
      userId: application.user_id,
      callType: 'resume_scoring',
      tokensUsed: scoringResult.tokensUsed,
    });

    // 7. Audit log
    await logAction({
      supabase,
      applicationId: application_id,
      actorType: 'llm',
      actorId: 'gpt-4o-mini',
      action: 'resume_scored',
      details: {
        score_id: scoreRecord.id,
        overall_score: scoringResult.overall_score,
        recommendation: scoringResult.recommendation,
        criteria_count: scoringResult.criteria_results.length,
        tokens_used: scoringResult.tokensUsed,
      },
    });

    // 8. Return the scoring result
    return NextResponse.json({
      data: {
        application_id,
        score_id: scoreRecord.id,
        criteria_results: scoringResult.criteria_results,
        overall_score: scoringResult.overall_score,
        recommendation: scoringResult.recommendation,
        status: 'pending_review',
      },
    });
  } catch (err) {
    console.error('[score] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
