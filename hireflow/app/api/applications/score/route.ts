import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { applications, jobPostings, resumeScores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { scoreResume } from '@/lib/scoring/scoreResume';
import { logAction } from '@/lib/audit/logAction';
import { logTokenUsage } from '@/lib/openai/logTokenUsage';
import { z } from 'zod/v4';

/**
 * POST /api/applications/score
 *
 * Called by n8n after resume text extraction.
 * Scores the resume against the job's structured criteria (Call 1).
 */

const scoreSchema = z.object({
  application_id: z.string().uuid(),
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
    const db = getDb();

    // 1. Get the application with resume text
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, application_id))
      .limit(1);

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (!application.resumeText) {
      return NextResponse.json(
        { error: 'Resume text not yet extracted. Run /extract first.' },
        { status: 422 }
      );
    }

    // 2. Get the job posting criteria
    const [job] = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.id, application.jobPostingId))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }

    const criteria = job.criteria as { name: string; description?: string; weight?: number }[];

    // 3. Call 1: Score resume against criteria
    const result = await scoreResume({
      criteria,
      resumeText: application.resumeText,
    });

    // 4. Store the score
    const [score] = await db
      .insert(resumeScores)
      .values({
        applicationId: application_id,
        criteriaResults: result.criteria_results,
        overallScore: String(result.overall_score),
        recommendation: result.recommendation,
      })
      .returning();

    // 5. Update application status
    await db
      .update(applications)
      .set({ status: 'pending_review' })
      .where(eq(applications.id, application_id));

    // 6. Log token usage
    await logTokenUsage({
      userId: application.userId,
      callType: 'resume_scoring',
      tokensUsed: result.tokensUsed,
    });

    // 7. Audit log
    await logAction({
      applicationId: application_id,
      actorType: 'llm',
      actorId: 'gpt-4o-mini',
      action: 'resume_scored',
      details: {
        score_id: score.id,
        overall_score: result.overall_score,
        recommendation: result.recommendation,
        criteria_count: result.criteria_results.length,
        tokens_used: result.tokensUsed,
      },
    });

    return NextResponse.json({
      data: {
        application_id,
        score_id: score.id,
        overall_score: result.overall_score,
        recommendation: result.recommendation,
        criteria_results: result.criteria_results,
      },
    });
  } catch (err) {
    console.error('[score] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
