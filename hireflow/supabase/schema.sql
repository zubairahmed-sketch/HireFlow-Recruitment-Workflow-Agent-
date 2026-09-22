-- =============================================================================
-- HireFlow Database Schema
-- Run this in your Supabase SQL Editor in one go.
-- All tables, RLS policies, and constraints defined per SPEC.md section 5.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. job_postings — the explicit rubric lives here, not in a prompt
-- -----------------------------------------------------------------------------
CREATE TABLE job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  title text NOT NULL,
  description text,
  criteria jsonb NOT NULL,        -- [{name, description, weight}] — explicit, structured
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own job postings"
  ON job_postings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own job postings"
  ON job_postings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job postings"
  ON job_postings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2. candidates
-- -----------------------------------------------------------------------------
CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own candidates"
  ON candidates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own candidates"
  ON candidates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own candidates"
  ON candidates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. applications — one candidate applying to one job posting
-- -----------------------------------------------------------------------------
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  candidate_id uuid REFERENCES candidates(id) NOT NULL,
  job_posting_id uuid REFERENCES job_postings(id) NOT NULL,
  resume_storage_path text NOT NULL,
  resume_text text,                -- extracted plain text
  status text DEFAULT 'received',  -- received | scored | pending_review | approved | rejected | more_info | interview_scheduled
  created_at timestamptz DEFAULT now()
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own applications"
  ON applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own applications"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own applications"
  ON applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. resume_scores — structured, per-criterion — the auditability layer
-- -----------------------------------------------------------------------------
CREATE TABLE resume_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) NOT NULL,
  criteria_results jsonb NOT NULL, -- [{criterion, met: bool, evidence: string}]
  overall_score numeric,
  recommendation text,             -- 'advance' | 'reject' | 'unclear' — a suggestion, not a decision
  created_at timestamptz DEFAULT now()
);

ALTER TABLE resume_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scores for their own applications"
  ON resume_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = resume_scores.application_id
        AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create scores for their own applications"
  ON resume_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = resume_scores.application_id
        AND applications.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5. human_decisions — the actual decision, always tied to a person
-- -----------------------------------------------------------------------------
CREATE TABLE human_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) NOT NULL,
  decided_by uuid REFERENCES auth.users NOT NULL,
  decision text NOT NULL,          -- 'approved' | 'rejected' | 'more_info'
  notes text,
  decided_at timestamptz DEFAULT now()
);

ALTER TABLE human_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view decisions for their own applications"
  ON human_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = human_decisions.application_id
        AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create decisions for their own applications"
  ON human_decisions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = human_decisions.application_id
        AND applications.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 6. interview_slots — simple scheduling, no external calendar dependency
-- -----------------------------------------------------------------------------
CREATE TABLE interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) NOT NULL,
  proposed_start timestamptz NOT NULL,
  proposed_end timestamptz NOT NULL,
  status text DEFAULT 'offered',   -- offered | confirmed | declined
  created_at timestamptz DEFAULT now()
);

ALTER TABLE interview_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view slots for their own applications"
  ON interview_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = interview_slots.application_id
        AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create slots for their own applications"
  ON interview_slots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = interview_slots.application_id
        AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update slots for their own applications"
  ON interview_slots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = interview_slots.application_id
        AND applications.user_id = auth.uid()
    )
  );

-- Allow candidates (unauthenticated) to confirm slots via public access
-- This is needed for the candidate-facing confirm page (/interviews/[id]/confirm)
-- In production, you'd use a signed token instead of public access.
CREATE POLICY "Anyone can confirm an interview slot"
  ON interview_slots FOR UPDATE
  USING (true)
  WITH CHECK (status IN ('offered', 'confirmed', 'declined'));

-- -----------------------------------------------------------------------------
-- 7. feedback_summaries
-- -----------------------------------------------------------------------------
CREATE TABLE feedback_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) NOT NULL,
  summary_text text NOT NULL,
  generated_at timestamptz DEFAULT now()
);

ALTER TABLE feedback_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view feedback for their own applications"
  ON feedback_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = feedback_summaries.application_id
        AND applications.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create feedback for their own applications"
  ON feedback_summaries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = feedback_summaries.application_id
        AND applications.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 8. audit_log — APPEND-ONLY. No UPDATE or DELETE policy. Ever.
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id),
  actor_type text NOT NULL,        -- 'system' | 'llm' | 'human'
  actor_id text,                   -- user id if human, model name if llm
  action text NOT NULL,            -- 'resume_scored' | 'decision_recorded' | 'email_sent' | ...
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: users can view audit entries for their own applications
CREATE POLICY "Users can view audit log for their own applications"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = audit_log.application_id
        AND applications.user_id = auth.uid()
    )
  );

-- INSERT only — no UPDATE, no DELETE. An editable audit log isn't an audit log.
CREATE POLICY "Users can append to audit log for their own applications"
  ON audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = audit_log.application_id
        AND applications.user_id = auth.uid()
    )
  );

-- IMPORTANT: No UPDATE policy exists on this table.
-- IMPORTANT: No DELETE policy exists on this table.
-- This is deliberate and must never change.

-- -----------------------------------------------------------------------------
-- 9. token_usage_logs
-- -----------------------------------------------------------------------------
CREATE TABLE token_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  call_type text NOT NULL,         -- 'resume_scoring' | 'email_drafting' | 'feedback_summary'
  tokens_used int NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE token_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own token usage"
  ON token_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can log their own token usage"
  ON token_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
