import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { z } from 'zod/v4';

/**
 * GET /api/applications/[id]
 * 
 * Returns the full application detail including:
 * - Application record
 * - Candidate info
 * - Job posting (with criteria)
 * - Resume score (per-criterion breakdown)
 * - Human decisions
 * - Full audit trail
 * 
 * Called by the dashboard's application detail page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch application with related data
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', id)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    // Fetch candidate
    const { data: candidate } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', application.candidate_id)
      .single();

    // Fetch job posting
    const { data: jobPosting } = await supabase
      .from('job_postings')
      .select('*')
      .eq('id', application.job_posting_id)
      .single();

    // Fetch resume score
    const { data: resumeScore } = await supabase
      .from('resume_scores')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch human decisions
    const { data: decisions } = await supabase
      .from('human_decisions')
      .select('*')
      .eq('application_id', id)
      .order('decided_at', { ascending: false });

    // Fetch audit trail
    const { data: auditLog } = await supabase
      .from('audit_log')
      .select('*')
      .eq('application_id', id)
      .order('created_at', { ascending: true });

    // Fetch interview slots
    const { data: interviewSlots } = await supabase
      .from('interview_slots')
      .select('*')
      .eq('application_id', id)
      .order('proposed_start', { ascending: true });

    return NextResponse.json({
      data: {
        application,
        candidate,
        jobPosting,
        resumeScore,
        decisions: decisions ?? [],
        auditLog: auditLog ?? [],
        interviewSlots: interviewSlots ?? [],
      },
    });
  } catch (err) {
    console.error('[GET /api/applications/[id]] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/applications/[id]
 * 
 * Updates application fields. Primary use case:
 * n8n stores its resume URL here after the Wait node generates it.
 * 
 * This is the critical step that makes the human-in-the-loop pattern work:
 * without saving this URL, the paused workflow can never be resumed.
 */
const patchSchema = z.object({
  n8n_resume_url: z.string().url().optional(),
  status: z
    .enum([
      'received',
      'scored',
      'pending_review',
      'approved',
      'rejected',
      'more_info',
      'interview_scheduled',
    ])
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Use service role client since n8n calls this without user auth
    const supabase = createServiceRoleClient();

    const updateData: Record<string, string> = {};
    if (parsed.data.n8n_resume_url) {
      updateData.n8n_resume_url = parsed.data.n8n_resume_url;
    }
    if (parsed.data.status) {
      updateData.status = parsed.data.status;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('applications')
      .update(updateData)
      .eq('id', id)
      .select('id, status, n8n_resume_url')
      .single();

    if (error || !data) {
      console.error('[PATCH /api/applications/[id]] Error:', error?.message);
      return NextResponse.json(
        { error: 'Failed to update application' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[PATCH /api/applications/[id]] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
