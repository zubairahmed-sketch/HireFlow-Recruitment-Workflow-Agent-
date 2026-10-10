import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { applications, candidates, jobPostings, feedbackSummaries } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateFeedbackSummary } from '@/lib/feedback/generateSummary';
import { logAction } from '@/lib/audit/logAction';
import { logTokenUsage } from '@/lib/openai/logTokenUsage';
import { z } from 'zod/v4';

/**
 * POST /api/feedback/generate
 * Call 3: Post-interview feedback summary generation.
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
    const db = getDb();

    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, application_id))
      .limit(1);

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const [candidateRows, jobRows] = await Promise.all([
      db.select().from(candidates).where(eq(candidates.id, application.candidateId)),
      db.select().from(jobPostings).where(eq(jobPostings.id, application.jobPostingId)),
    ]);

    // Call 3: Generate feedback summary
    const result = await generateFeedbackSummary({
      interviewNotes: interview_notes,
      candidateName: candidateRows[0]?.fullName ?? 'Candidate',
      jobTitle: jobRows[0]?.title ?? 'Position',
    });

    const [summaryRecord] = await db
      .insert(feedbackSummaries)
      .values({
        applicationId: application_id,
        summaryText: result.summary_text,
      })
      .returning();

    await logTokenUsage({
      userId: application.userId,
      callType: 'feedback_summary',
      tokensUsed: result.tokensUsed,
    });

    await logAction({
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
        generated_at: summaryRecord.generatedAt,
      },
    });
  } catch (err) {
    console.error('[feedback] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
