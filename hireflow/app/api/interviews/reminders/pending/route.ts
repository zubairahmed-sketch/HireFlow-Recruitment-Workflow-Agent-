import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/interviews/reminders/pending
 *
 * Called by n8n's reminder sub-workflow (daily schedule).
 * Returns applications with unconfirmed slots older than 48 hours.
 * Protected by a simple bearer token (N8N_SERVICE_TOKEN).
 */

interface SlotRow {
  id: string;
  application_id: string;
  proposed_start: string;
  proposed_end: string;
  created_at: string;
}

interface ApplicationRow {
  id: string;
  candidate_id: string;
  job_posting_id: string;
}

interface CandidateRow {
  id: string;
  full_name: string;
  email: string;
}

interface JobRow {
  id: string;
  title: string;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.N8N_SERVICE_TOKEN;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: slots, error } = await supabase
    .from('interview_slots')
    .select('id, application_id, proposed_start, proposed_end, created_at')
    .eq('status', 'offered')
    .lt('created_at', cutoff);

  if (error) {
    console.error('[reminders/pending] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch pending slots' }, { status: 500 });
  }

  const typedSlots = (slots ?? []) as SlotRow[];
  if (typedSlots.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Deduplicate by application_id
  const appIds = [...new Set(typedSlots.map((s: SlotRow) => s.application_id))];

  const { data: applications } = await supabase
    .from('applications')
    .select('id, candidate_id, job_posting_id')
    .in('id', appIds);

  const typedApps = (applications ?? []) as ApplicationRow[];
  if (typedApps.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const candidateIds = typedApps.map((a: ApplicationRow) => a.candidate_id);
  const jobIds = typedApps.map((a: ApplicationRow) => a.job_posting_id);

  const [candidatesRes, jobsRes] = await Promise.all([
    supabase.from('candidates').select('id, full_name, email').in('id', candidateIds),
    supabase.from('job_postings').select('id, title').in('id', jobIds),
  ]);

  const candidateMap = new Map(
    ((candidatesRes.data ?? []) as CandidateRow[]).map((c: CandidateRow) => [c.id, c])
  );
  const jobMap = new Map(
    ((jobsRes.data ?? []) as JobRow[]).map((j: JobRow) => [j.id, j])
  );

  const result = typedApps.map((app: ApplicationRow) => {
    const candidate = candidateMap.get(app.candidate_id);
    const job = jobMap.get(app.job_posting_id);
    return {
      application_id: app.id,
      candidate_name: candidate?.full_name ?? 'Candidate',
      candidate_email: candidate?.email ?? '',
      job_title: job?.title ?? 'Position',
    };
  });

  return NextResponse.json({ data: result });
}
