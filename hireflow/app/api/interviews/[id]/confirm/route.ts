import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { z } from 'zod/v4';

/**
 * POST /api/interviews/[id]/confirm
 * 
 * Candidate-facing endpoint — accessed via emailed link, NO auth required.
 * The candidate clicks a link to confirm one of the offered time slots.
 * 
 * [id] here is the interview_slot id, not the application id.
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
    const supabase = createServiceRoleClient();

    // 1. Verify the slot exists and belongs to this application
    const { data: slot, error: slotError } = await supabase
      .from('interview_slots')
      .select('id, application_id, status')
      .eq('id', slot_id)
      .eq('application_id', applicationId)
      .single();

    if (slotError || !slot) {
      return NextResponse.json(
        { error: 'Interview slot not found' },
        { status: 404 }
      );
    }

    if (slot.status === 'confirmed') {
      return NextResponse.json(
        { error: 'This slot has already been confirmed' },
        { status: 409 }
      );
    }

    if (slot.status === 'declined') {
      return NextResponse.json(
        { error: 'This slot has been declined' },
        { status: 409 }
      );
    }

    // 2. Confirm the selected slot
    const { error: confirmError } = await supabase
      .from('interview_slots')
      .update({ status: 'confirmed' })
      .eq('id', slot_id);

    if (confirmError) {
      console.error('[confirm] Failed to confirm slot:', confirmError.message);
      return NextResponse.json(
        { error: 'Failed to confirm interview slot' },
        { status: 500 }
      );
    }

    // 3. Decline all other offered slots for this application
    await supabase
      .from('interview_slots')
      .update({ status: 'declined' })
      .eq('application_id', applicationId)
      .neq('id', slot_id)
      .eq('status', 'offered');

    // 4. Update application status
    await supabase
      .from('applications')
      .update({ status: 'interview_scheduled' })
      .eq('id', applicationId);

    // 5. Audit log
    const { logAction } = await import('@/lib/audit/logAction');
    await logAction({
      supabase,
      applicationId,
      actorType: 'system',
      actorId: 'candidate:confirm',
      action: 'interview_slot_confirmed',
      details: {
        confirmed_slot_id: slot_id,
      },
    });

    return NextResponse.json({
      data: {
        slot_id,
        application_id: applicationId,
        status: 'confirmed',
      },
    });
  } catch (err) {
    console.error('[confirm] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/interviews/[id]/confirm
 * 
 * Returns the available interview slots for a candidate to choose from.
 * [id] is the application ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;
    const supabase = createServiceRoleClient();

    // Fetch application with candidate and job info
    const { data: application } = await supabase
      .from('applications')
      .select('id, candidate_id, job_posting_id, status')
      .eq('id', applicationId)
      .single();

    if (!application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    const [candidateRes, jobRes, slotsRes] = await Promise.all([
      supabase
        .from('candidates')
        .select('full_name, email')
        .eq('id', application.candidate_id)
        .single(),
      supabase
        .from('job_postings')
        .select('title')
        .eq('id', application.job_posting_id)
        .single(),
      supabase
        .from('interview_slots')
        .select('*')
        .eq('application_id', applicationId)
        .order('proposed_start', { ascending: true }),
    ]);

    return NextResponse.json({
      data: {
        application_id: applicationId,
        candidate_name: candidateRes.data?.full_name ?? 'Candidate',
        job_title: jobRes.data?.title ?? 'Position',
        slots: slotsRes.data ?? [],
        already_confirmed: (slotsRes.data ?? []).some(
          (s: { status: string }) => s.status === 'confirmed'
        ),
      },
    });
  } catch (err) {
    console.error('[GET confirm] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
