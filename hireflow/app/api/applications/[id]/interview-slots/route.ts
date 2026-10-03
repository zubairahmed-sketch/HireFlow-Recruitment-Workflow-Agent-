import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { z } from 'zod/v4';
import { logAction } from '@/lib/audit/logAction';

/**
 * POST /api/applications/[id]/interview-slots
 *
 * Called by n8n immediately after a candidate is Approved.
 * Creates 2–3 offered interview slot rows in the database.
 * No external calendar API required — simple offered-times pattern per spec.
 *
 * Accepts optional explicit slots; if none provided, auto-generates
 * 3 slots for the next business week (Mon/Wed/Fri at 10am UTC).
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
    if (day !== 0 && day !== 6) added++; // skip Sat/Sun
  }
  return d;
}

function generateDefaultSlots(): { proposed_start: string; proposed_end: string }[] {
  const now = new Date();
  // Start from tomorrow at minimum
  const base = nextBusinessDay(now, 1);

  return [1, 3, 5].map((skip) => {
    const day = nextBusinessDay(base, skip - 1);
    const start = new Date(day);
    start.setUTCHours(10, 0, 0, 0); // 10:00 UTC
    const end = new Date(start);
    end.setUTCHours(11, 0, 0, 0); // 1 hour slot
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

    const supabase = createServiceRoleClient();

    // Verify application exists
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, user_id')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const slotsToInsert = (parsed.data.slots ?? generateDefaultSlots()).map(
      (s) => ({
        application_id: applicationId,
        proposed_start: s.proposed_start,
        proposed_end: s.proposed_end,
        status: 'offered',
      })
    );

    const { data: createdSlots, error: insertError } = await supabase
      .from('interview_slots')
      .insert(slotsToInsert)
      .select('id, proposed_start, proposed_end, status');

    if (insertError) {
      console.error('[interview-slots] Insert error:', insertError.message);
      return NextResponse.json(
        { error: 'Failed to create interview slots' },
        { status: 500 }
      );
    }

    await logAction({
      supabase,
      applicationId,
      actorType: 'system',
      actorId: 'api:interview-slots',
      action: 'interview_slots_created',
      details: {
        slot_count: createdSlots?.length ?? 0,
        slots: createdSlots?.map((s: { id: string; proposed_start: string; proposed_end: string }) => ({
          id: s.id,
          start: s.proposed_start,
          end: s.proposed_end,
        })),
      },
    });

    return NextResponse.json(
      {
        data: {
          application_id: applicationId,
          slots: createdSlots ?? [],
          confirm_url: `/interviews/${applicationId}/confirm`,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[interview-slots] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/applications/[id]/interview-slots
 * Returns all slots for an application (for the dashboard to display).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('interview_slots')
      .select('*')
      .eq('application_id', applicationId)
      .order('proposed_start', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[interview-slots GET] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
