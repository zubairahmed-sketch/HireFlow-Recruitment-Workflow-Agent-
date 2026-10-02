import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Briefcase, Users, ClipboardCheck, Clock } from 'lucide-react';
import Link from 'next/link';

/**
 * Dashboard page — the review queue.
 * Shows scored candidates awaiting human review.
 * Sortable by score, filterable by job and status.
 */
export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch stats
  const [jobsResult, pendingResult, candidatesResult, interviewsResult] =
    await Promise.all([
      supabase
        .from('job_postings')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review'),
      supabase.from('candidates').select('id', { count: 'exact', head: true }),
      supabase
        .from('interview_slots')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed'),
    ]);

  const stats = {
    activeJobs: jobsResult.count ?? 0,
    pendingReview: pendingResult.count ?? 0,
    totalCandidates: candidatesResult.count ?? 0,
    interviewsScheduled: interviewsResult.count ?? 0,
  };

  // Fetch applications with related data for the queue
  const { data: applications } = await supabase
    .from('applications')
    .select(`
      id,
      status,
      created_at,
      candidate_id,
      job_posting_id
    `)
    .order('created_at', { ascending: false });

  // Fetch related data separately (Supabase doesn't support deep joins without foreign key setup)
  let enrichedApps: Array<{
    id: string;
    status: string;
    created_at: string;
    candidate_name: string;
    candidate_email: string;
    job_title: string;
    overall_score: number | null;
    recommendation: string | null;
  }> = [];

  if (applications && applications.length > 0) {
    const candidateIds = [...new Set(applications.map((a) => a.candidate_id))];
    const jobIds = [...new Set(applications.map((a) => a.job_posting_id))];
    const appIds = applications.map((a) => a.id);

    const [candidatesRes, jobsRes, scoresRes] = await Promise.all([
      supabase.from('candidates').select('id, full_name, email').in('id', candidateIds),
      supabase.from('job_postings').select('id, title').in('id', jobIds),
      supabase
        .from('resume_scores')
        .select('application_id, overall_score, recommendation')
        .in('application_id', appIds),
    ]);

    const candidateMap = new Map(
      (candidatesRes.data ?? []).map((c) => [c.id, c])
    );
    const jobMap = new Map(
      (jobsRes.data ?? []).map((j) => [j.id, j])
    );
    const scoreMap = new Map(
      (scoresRes.data ?? []).map((s) => [s.application_id, s])
    );

    enrichedApps = applications.map((app) => {
      const candidate = candidateMap.get(app.candidate_id);
      const job = jobMap.get(app.job_posting_id);
      const score = scoreMap.get(app.id);
      return {
        id: app.id,
        status: app.status,
        created_at: app.created_at,
        candidate_name: candidate?.full_name ?? 'Unknown',
        candidate_email: candidate?.email ?? '',
        job_title: job?.title ?? 'Unknown',
        overall_score: score?.overall_score ?? null,
        recommendation: score?.recommendation ?? null,
      };
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1F2933]">
          Dashboard
        </h1>
        <p className="text-sm text-[#627D98] mt-1">
          Review scored candidates and manage your recruitment pipeline
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#E4E7EB]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#627D98]">
              Active Jobs
            </CardTitle>
            <Briefcase className="h-4 w-4 text-[#0F6E5C]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1F2933]">
              {stats.activeJobs}
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E4E7EB]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#627D98]">
              Pending Review
            </CardTitle>
            <ClipboardCheck className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1F2933]">
              {stats.pendingReview}
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E4E7EB]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#627D98]">
              Total Candidates
            </CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1F2933]">
              {stats.totalCandidates}
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E4E7EB]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#627D98]">
              Interviews Scheduled
            </CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#1F2933]">
              {stats.interviewsScheduled}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Review Queue Table */}
      <Card className="border-[#E4E7EB]">
        <CardHeader>
          <CardTitle className="text-lg">Candidate Review Queue</CardTitle>
          <CardDescription>
            Scored candidates awaiting your review. Click a row to view the full
            score breakdown and make a decision.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enrichedApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-[#F0F4F8] flex items-center justify-center mb-4">
                <ClipboardCheck className="w-8 h-8 text-[#9FB3C8]" />
              </div>
              <p className="text-[#627D98] text-sm max-w-sm">
                No applications yet. Create a job posting, then submit
                applications through the webhook to see them here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center">Recommendation</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedApps.map((app) => (
                  <TableRow key={app.id} className="group">
                    <TableCell>
                      <div>
                        <div className="font-medium text-[#1F2933]">
                          {app.candidate_name}
                        </div>
                        <div className="text-xs text-[#627D98]">
                          {app.candidate_email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#334E68]">
                      {app.job_title}
                    </TableCell>
                    <TableCell className="text-center">
                      {app.overall_score !== null ? (
                        <span
                          className={`font-mono font-semibold ${
                            app.overall_score >= 70
                              ? 'text-[#0F6E5C]'
                              : app.overall_score >= 40
                              ? 'text-amber-600'
                              : 'text-red-600'
                          }`}
                        >
                          {app.overall_score}
                        </span>
                      ) : (
                        <span className="text-[#9FB3C8]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <RecommendationBadge value={app.recommendation} />
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge value={app.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-[#627D98] font-mono">
                      {new Date(app.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/applications/${app.id}`}
                        className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium text-[#0F6E5C] bg-[#E6F7F3] hover:bg-[#D1F0E8] transition-colors"
                      >
                        Review
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Helper Components ----

function RecommendationBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-[#9FB3C8]">—</span>;

  const config: Record<string, { label: string; className: string }> = {
    advance: {
      label: 'Advance',
      className: 'bg-[#E6F7F3] text-[#0F6E5C]',
    },
    reject: {
      label: 'Reject',
      className: 'bg-red-50 text-red-700',
    },
    unclear: {
      label: 'Unclear',
      className: 'bg-amber-50 text-amber-700',
    },
  };

  const c = config[value] ?? { label: value, className: 'bg-gray-100 text-gray-600' };

  return (
    <Badge variant="secondary" className={`${c.className} text-xs`}>
      {c.label}
    </Badge>
  );
}

function StatusBadge({ value }: { value: string }) {
  const config: Record<string, { label: string; className: string }> = {
    received: { label: 'Received', className: 'bg-gray-100 text-gray-600' },
    scored: { label: 'Scored', className: 'bg-blue-50 text-blue-700' },
    pending_review: {
      label: 'Pending Review',
      className: 'bg-amber-50 text-amber-700',
    },
    approved: { label: 'Approved', className: 'bg-[#E6F7F3] text-[#0F6E5C]' },
    rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700' },
    more_info: {
      label: 'More Info',
      className: 'bg-purple-50 text-purple-700',
    },
    interview_scheduled: {
      label: 'Interview',
      className: 'bg-blue-50 text-blue-700',
    },
  };

  const c = config[value] ?? { label: value, className: 'bg-gray-100 text-gray-600' };

  return (
    <Badge variant="secondary" className={`${c.className} text-xs`}>
      {c.label}
    </Badge>
  );
}
