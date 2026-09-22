/**
 * Shared TypeScript types for HireFlow.
 * These match the database schema in supabase/schema.sql exactly.
 */

// -- Job Postings --

export interface JobCriterion {
  name: string;
  description: string;
  weight: number;
}

export interface JobPosting {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  criteria: JobCriterion[];
  is_active: boolean;
  created_at: string;
}

// -- Candidates --

export interface Candidate {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
}

// -- Applications --

export type ApplicationStatus =
  | 'received'
  | 'scored'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'more_info'
  | 'interview_scheduled';

export interface Application {
  id: string;
  user_id: string;
  candidate_id: string;
  job_posting_id: string;
  resume_storage_path: string;
  resume_text: string | null;
  status: ApplicationStatus;
  created_at: string;
}

// -- Resume Scores --

export interface CriterionResult {
  criterion: string;
  met: boolean;
  evidence: string;
}

export type ScoringRecommendation = 'advance' | 'reject' | 'unclear';

export interface ResumeScore {
  id: string;
  application_id: string;
  criteria_results: CriterionResult[];
  overall_score: number;
  recommendation: ScoringRecommendation;
  created_at: string;
}

// -- Human Decisions --

export type HumanDecisionType = 'approved' | 'rejected' | 'more_info';

export interface HumanDecision {
  id: string;
  application_id: string;
  decided_by: string;
  decision: HumanDecisionType;
  notes: string | null;
  decided_at: string;
}

// -- Interview Slots --

export type InterviewSlotStatus = 'offered' | 'confirmed' | 'declined';

export interface InterviewSlot {
  id: string;
  application_id: string;
  proposed_start: string;
  proposed_end: string;
  status: InterviewSlotStatus;
  created_at: string;
}

// -- Feedback Summaries --

export interface FeedbackSummary {
  id: string;
  application_id: string;
  summary_text: string;
  generated_at: string;
}

// -- Audit Log --

export type AuditActorType = 'system' | 'llm' | 'human';

export interface AuditLogEntry {
  id: string;
  application_id: string | null;
  actor_type: AuditActorType;
  actor_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// -- Token Usage --

export type LLMCallType = 'resume_scoring' | 'email_drafting' | 'feedback_summary';

export interface TokenUsageLog {
  id: string;
  user_id: string;
  call_type: LLMCallType;
  tokens_used: number;
  created_at: string;
}
