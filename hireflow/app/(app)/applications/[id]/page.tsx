import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, XCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { DecisionPanel } from '@/components/decision-panel';
import type { CriterionResult } from '@/lib/types';

/**
 * Application detail page — the core screen per SPEC.md section 7.
 * Left: candidate info + resume text
 * Right: score breakdown — every criterion with met/not-met badge + evidence
 * Below: Approve / Reject / Request More Info buttons
 * Bottom: full audit trail
 */
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch all related data
  const { data: application } = await supabase
    .from('applications')
    .select('*')
    .eq('id', id)
    .single();

  if (!application) {
    notFound();
  }

  const [candidateRes, jobRes, scoreRes, decisionsRes, auditRes] =
    await Promise.all([
      supabase
        .from('candidates')
        .select('*')
        .eq('id', application.candidate_id)
        .single(),
      supabase
        .from('job_postings')
        .select('*')
        .eq('id', application.job_posting_id)
        .single(),
      supabase
        .from('resume_scores')
        .select('*')
        .eq('application_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('human_decisions')
        .select('*')
        .eq('application_id', id)
        .order('decided_at', { ascending: false }),
      supabase
        .from('audit_log')
        .select('*')
        .eq('application_id', id)
        .order('created_at', { ascending: true }),
    ]);

  const candidate = candidateRes.data;
  const jobPosting = jobRes.data;
  const resumeScore = scoreRes.data;
  const decisions = decisionsRes.data ?? [];
  const auditLog = auditRes.data ?? [];

  const canDecide =
    application.status === 'pending_review' ||
    application.status === 'more_info';

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-[#627D98] hover:text-[#1F2933] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F2933]">
            {candidate?.full_name ?? 'Unknown Candidate'}
          </h1>
          <p className="text-sm text-[#627D98] mt-1">
            {candidate?.email} · Applied for{' '}
            <span className="font-medium text-[#334E68]">
              {jobPosting?.title ?? 'Unknown Position'}
            </span>
          </p>
        </div>
        <StatusBadge value={application.status} />
      </div>

      {/* Main content: two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Candidate info + resume text */}
        <div className="space-y-6">
          <Card className="border-[#E4E7EB]">
            <CardHeader>
              <CardTitle className="text-base">Resume</CardTitle>
              <CardDescription>Extracted text from the uploaded resume</CardDescription>
            </CardHeader>
            <CardContent>
              {application.resume_text ? (
                <pre className="whitespace-pre-wrap text-sm text-[#334E68] font-sans leading-relaxed max-h-[500px] overflow-y-auto bg-[#F7F8FA] rounded-lg p-4 border border-[#E4E7EB]">
                  {application.resume_text}
                </pre>
              ) : (
                <p className="text-sm text-[#9FB3C8] italic">
                  Resume text has not been extracted yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Score breakdown */}
        <div className="space-y-6">
          {/* Score summary */}
          {resumeScore ? (
            <Card className="border-[#E4E7EB]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Score Breakdown</CardTitle>
                  <div className="flex items-center gap-3">
                    <RecommendationBadge value={resumeScore.recommendation} />
                    <span
                      className={`text-2xl font-bold font-mono ${
                        resumeScore.overall_score >= 70
                          ? 'text-[#0F6E5C]'
                          : resumeScore.overall_score >= 40
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {resumeScore.overall_score}
                    </span>
                  </div>
                </div>
                <CardDescription>
                  Per-criterion assessment with evidence from the resume
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(resumeScore.criteria_results as CriterionResult[]).map(
                    (cr, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-[#E4E7EB] p-3"
                      >
                        <div className="flex items-start gap-2">
                          {cr.met ? (
                            <CheckCircle2 className="w-5 h-5 text-[#0F6E5C] mt-0.5 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-[#1F2933]">
                                {cr.criterion}
                              </span>
                              <Badge
                                variant="secondary"
                                className={`text-xs ${
                                  cr.met
                                    ? 'bg-[#E6F7F3] text-[#0F6E5C]'
                                    : 'bg-red-50 text-red-700'
                                }`}
                              >
                                {cr.met ? 'Met' : 'Not met'}
                              </Badge>
                            </div>
                            <p className="text-xs text-[#627D98] mt-1 leading-relaxed">
                              {cr.evidence}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#E4E7EB]">
              <CardContent className="py-8 text-center">
                <AlertCircle className="w-8 h-8 text-[#9FB3C8] mx-auto mb-2" />
                <p className="text-sm text-[#627D98]">
                  Resume has not been scored yet.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Decision Panel */}
          {canDecide && (
            <DecisionPanel applicationId={id} />
          )}

          {/* Previous Decisions */}
          {decisions.length > 0 && (
            <Card className="border-[#E4E7EB]">
              <CardHeader>
                <CardTitle className="text-base">Decision History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {decisions.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <DecisionIcon decision={d.decision} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize text-[#1F2933]">
                            {d.decision}
                          </span>
                          <span className="text-xs text-[#9FB3C8] font-mono">
                            {new Date(d.decided_at).toLocaleString()}
                          </span>
                        </div>
                        {d.notes && (
                          <p className="text-xs text-[#627D98] mt-0.5">
                            {d.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Audit Trail */}
      <Card className="border-[#E4E7EB]">
        <CardHeader>
          <CardTitle className="text-base">Audit Trail</CardTitle>
          <CardDescription>
            Every system, LLM, and human action on this application, chronologically
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-[#9FB3C8] italic py-4 text-center">
              No audit entries yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[80px]">Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs text-[#627D98]">
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <ActorBadge actorType={entry.actor_type} />
                    </TableCell>
                    <TableCell className="text-sm text-[#334E68]">
                      {formatAction(entry.action)}
                    </TableCell>
                    <TableCell className="text-xs text-[#627D98] max-w-[300px] truncate">
                      {entry.details
                        ? JSON.stringify(entry.details).slice(0, 120)
                        : '—'}
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
      label: 'More Info Requested',
      className: 'bg-purple-50 text-purple-700',
    },
    interview_scheduled: {
      label: 'Interview Scheduled',
      className: 'bg-blue-50 text-blue-700',
    },
  };

  const c = config[value] ?? { label: value, className: 'bg-gray-100 text-gray-600' };
  return (
    <Badge variant="secondary" className={c.className}>
      {c.label}
    </Badge>
  );
}

function RecommendationBadge({ value }: { value: string }) {
  const config: Record<string, { label: string; className: string }> = {
    advance: { label: 'Advance', className: 'bg-[#E6F7F3] text-[#0F6E5C]' },
    reject: { label: 'Reject', className: 'bg-red-50 text-red-700' },
    unclear: { label: 'Unclear', className: 'bg-amber-50 text-amber-700' },
  };
  const c = config[value] ?? { label: value, className: 'bg-gray-100 text-gray-600' };
  return (
    <Badge variant="secondary" className={`${c.className} text-xs`}>
      {c.label}
    </Badge>
  );
}

function DecisionIcon({ decision }: { decision: string }) {
  switch (decision) {
    case 'approved':
      return <CheckCircle2 className="w-4 h-4 text-[#0F6E5C] mt-0.5" />;
    case 'rejected':
      return <XCircle className="w-4 h-4 text-red-500 mt-0.5" />;
    case 'more_info':
      return <AlertCircle className="w-4 h-4 text-purple-600 mt-0.5" />;
    default:
      return <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5" />;
  }
}

function ActorBadge({ actorType }: { actorType: string }) {
  const config: Record<string, { label: string; className: string }> = {
    system: { label: 'System', className: 'bg-gray-100 text-gray-600' },
    llm: { label: 'LLM', className: 'bg-blue-50 text-blue-700' },
    human: { label: 'Human', className: 'bg-[#E6F7F3] text-[#0F6E5C]' },
  };
  const c = config[actorType] ?? {
    label: actorType,
    className: 'bg-gray-100 text-gray-600',
  };
  return (
    <Badge variant="secondary" className={`${c.className} text-xs`}>
      {c.label}
    </Badge>
  );
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
