import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { applications, candidates, jobPostings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { draftEmail } from '@/lib/scoring/draftEmail';
import { logAction } from '@/lib/audit/logAction';
import { logTokenUsage } from '@/lib/openai/logTokenUsage';
import { z } from 'zod/v4';

/**
 * POST /api/emails/draft
 * Call 2: Draft email copy for the human-approved decision.
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

    const result = await draftEmail({
      decisionType: decision_type,
      candidateName: candidateRows[0]?.fullName ?? 'Candidate',
      jobTitle: jobRows[0]?.title ?? 'Position',
      notes,
    });

    await logTokenUsage({
      userId: application.userId,
      callType: 'email_drafting',
      tokensUsed: result.tokensUsed,
    });

    await logAction({
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
    console.error('[email/draft] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
