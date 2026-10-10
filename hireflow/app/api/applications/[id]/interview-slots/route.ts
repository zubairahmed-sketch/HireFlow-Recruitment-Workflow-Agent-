import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { interviewSlots } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * POST /api/applications/[id]/interview-slots
 * Called by n8n on approval. Creates 2-3 offered time slots.
 *
 * GET /api/applications/[id]/interview-slots
 * Returns all slots for an application.
 */

const slotsSchema = z.object({
  slots: z
    .array(
      z.object({
        proposed_start: z.string().datetime(),
        proposed_end: z.string().datetime(),
      })
    )
    .max(5)
    .optional(),
});

function nextBusinessDay(date: Date, skipDays: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < skipDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function generateDefaultSlots(): { proposed_start: string; proposed_end: string }[] {
  const now = new Date();
  const base = nextBusinessDay(now, 1);
  return [1, 3, 5].map((skip) => {
    const day = nextBusinessDay(base, skip - 1);
    const start = new Date(day);
    start.setUTCHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(11, 0, 0, 0);
    return {
      proposed_start: start.toISOString(),
      proposed_end: end.toISOString(),
    };
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = slotsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const db = getDb();
    const slotsToInsert = (parsed.data.slots ?? generateDefaultSlots()).map((s) => ({
      applicationId,
      proposedStart: new Date(s.proposed_start),
      proposedEnd: new Date(s.proposed_end),
      status: 'offered' as const,
    }));

    const createdSlots = await db
      .insert(interviewSlots)
      .values(slotsToInsert)
      .returning();

    await logAction({
      applicationId,
      actorType: 'system',
      actorId: 'api:interview-slots',
      action: 'interview_slots_created',
      details: { slot_count: createdSlots.length },
    });

    return NextResponse.json(
      {
        data: {
          application_id: applicationId,
          slots: createdSlots,
          confirm_url: `/interviews/${applicationId}/confirm`,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[interview-slots] Error:', err);
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

    const slots = await db
      .select()
      .from(interviewSlots)
      .where(eq(interviewSlots.applicationId, applicationId));

    return NextResponse.json({ data: slots });
  } catch (err) {
    console.error('[interview-slots GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
