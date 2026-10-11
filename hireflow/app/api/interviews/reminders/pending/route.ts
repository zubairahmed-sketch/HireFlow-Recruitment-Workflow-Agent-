import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { interviewSlots, applications, candidates, jobPostings } from '@/lib/db/schema';
import { eq, lt } from 'drizzle-orm';

/**
 * GET /api/interviews/reminders/pending
 * Called by n8n's daily reminder workflow.
 * Returns applications with unconfirmed slots older than 48h.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.N8N_SERVICE_TOKEN;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const slots = await db
    .select()
    .from(interviewSlots)
    .where(eq(interviewSlots.status, 'offered'));

  // Filter to slots created more than 48h ago
  const oldSlots = slots.filter(
    (s) => s.createdAt && new Date(s.createdAt) < cutoff
  );

  if (oldSlots.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const appIds = [...new Set(oldSlots.map((s) => s.applicationId))];

  const result = await Promise.all(
    appIds.map(async (appId) => {
      const [app] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, appId))
        .limit(1);

      if (!app) return null;

      const [candidate] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, app.candidateId))
        .limit(1);

      const [job] = await db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, app.jobPostingId))
        .limit(1);

      return {
        application_id: app.id,
        candidate_name: candidate?.fullName ?? 'Candidate',
        candidate_email: candidate?.email ?? '',
        job_title: job?.title ?? 'Position',
      };
    })
  );

  return NextResponse.json({ data: result.filter(Boolean) });
}
