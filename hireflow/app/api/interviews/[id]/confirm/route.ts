import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { interviewSlots, applications, candidates, jobPostings } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * GET /api/interviews/[id]/confirm — returns available slots for a candidate.
 * POST /api/interviews/[id]/confirm — candidate confirms a slot.
 * [id] is the application ID. No auth — accessed via emailed link.
 */

const confirmSchema = z.object({
  slot_id: z.string().uuid('Valid slot ID is required'),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { slot_id } = parsed.data;
    const db = getDb();

    // 1. Verify slot exists and belongs to this application
    const [slot] = await db
      .select()
      .from(interviewSlots)
      .where(
        and(
          eq(interviewSlots.id, slot_id),
          eq(interviewSlots.applicationId, applicationId)
        )
      )
      .limit(1);

    if (!slot) {
      return NextResponse.json({ error: 'Interview slot not found' }, { status: 404 });
    }

    if (slot.status === 'confirmed') {
      return NextResponse.json({ error: 'Already confirmed' }, { status: 409 });
    }

    // 2. Confirm the selected slot
    await db
      .update(interviewSlots)
      .set({ status: 'confirmed' })
      .where(eq(interviewSlots.id, slot_id));

    // 3. Decline other offered slots
    await db
      .update(interviewSlots)
      .set({ status: 'declined' })
      .where(
        and(
          eq(interviewSlots.applicationId, applicationId),
          ne(interviewSlots.id, slot_id),
          eq(interviewSlots.status, 'offered')
        )
      );

    // 4. Update application status
    await db
      .update(applications)
      .set({ status: 'interview_scheduled' })
      .where(eq(applications.id, applicationId));

    // 5. Audit log
    await logAction({
      applicationId,
      actorType: 'system',
      actorId: 'candidate:confirm',
      action: 'interview_slot_confirmed',
      details: { confirmed_slot_id: slot_id },
    });

    return NextResponse.json({
      data: { slot_id, application_id: applicationId, status: 'confirmed' },
    });
  } catch (err) {
    console.error('[confirm POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const db = getDb();

    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const [candidateRows, jobRows, slotRows] = await Promise.all([
      db.select().from(candidates).where(eq(candidates.id, application.candidateId)),
      db.select().from(jobPostings).where(eq(jobPostings.id, application.jobPostingId)),
      db.select().from(interviewSlots).where(eq(interviewSlots.applicationId, applicationId)),
    ]);

    return NextResponse.json({
      data: {
        application_id: applicationId,
        candidate_name: candidateRows[0]?.fullName ?? 'Candidate',
        job_title: jobRows[0]?.title ?? 'Position',
        slots: slotRows,
        already_confirmed: slotRows.some((s) => s.status === 'confirmed'),
      },
    });
  } catch (err) {
    console.error('[confirm GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
