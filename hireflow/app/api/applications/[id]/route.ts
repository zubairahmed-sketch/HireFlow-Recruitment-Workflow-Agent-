import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  applications,
  candidates,
  jobPostings,
  resumeScores,
  humanDecisions,
  interviewSlots,
  feedbackSummaries,
  auditLog,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/applications/[id]
 * Returns full application detail: candidate, job, scores, decisions, audit trail, slots.
 *
 * PATCH /api/applications/[id]
 * Stores the n8n resume URL — the critical step for the Wait node pattern.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .limit(1);

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // Fetch all related data in parallel
    const [
      candidateRows,
      jobRows,
      scoreRows,
      decisionRows,
      slotRows,
      feedbackRows,
      auditRows,
    ] = await Promise.all([
      db.select().from(candidates).where(eq(candidates.id, application.candidateId)),
      db.select().from(jobPostings).where(eq(jobPostings.id, application.jobPostingId)),
      db.select().from(resumeScores).where(eq(resumeScores.applicationId, id)),
      db.select().from(humanDecisions).where(eq(humanDecisions.applicationId, id)),
      db.select().from(interviewSlots).where(eq(interviewSlots.applicationId, id)),
      db.select().from(feedbackSummaries).where(eq(feedbackSummaries.applicationId, id)),
      db.select().from(auditLog).where(eq(auditLog.applicationId, id)),
    ]);

    return NextResponse.json({
      data: {
        ...application,
        candidate: candidateRows[0] ?? null,
        job_posting: jobRows[0] ?? null,
        score: scoreRows[0] ?? null,
        decisions: decisionRows,
        interview_slots: slotRows,
        feedback_summaries: feedbackRows,
        audit_log: auditRows,
      },
    });
  } catch (err) {
    console.error('[applications/[id] GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    // Only allow updating n8n_resume_url
    if (body.n8n_resume_url) {
      await db
        .update(applications)
        .set({ n8nResumeUrl: body.n8n_resume_url })
        .where(eq(applications.id, id));
    }

    return NextResponse.json({ data: { id, updated: true } });
  } catch (err) {
    console.error('[applications/[id] PATCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
