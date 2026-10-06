/**
 * Drizzle ORM schema for HireFlow.
 *
 * Key differences from Supabase version:
 * - user_id is text (Clerk IDs are strings like "user_2abc...")
 * - No RLS — auth enforced at application layer via Clerk's auth()
 * - No auth.users references — Clerk manages users externally
 * - resume_storage_path stores Uploadthing URLs instead of Supabase Storage paths
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// 1. job_postings — the explicit rubric lives here, not in a prompt
// ---------------------------------------------------------------------------
export const jobPostings = pgTable('job_postings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  criteria: jsonb('criteria').notNull(), // [{name, description, weight}]
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 2. candidates
// ---------------------------------------------------------------------------
export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 3. applications — one candidate applying to one job posting
// ---------------------------------------------------------------------------
export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
  jobPostingId: uuid('job_posting_id').notNull().references(() => jobPostings.id),
  resumeStoragePath: text('resume_storage_path').notNull(), // Uploadthing URL
  resumeText: text('resume_text'),
  n8nResumeUrl: text('n8n_resume_url'),
  status: text('status').default('received').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 4. resume_scores — structured, per-criterion
// ---------------------------------------------------------------------------
export const resumeScores = pgTable('resume_scores', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: uuid('application_id').notNull().references(() => applications.id),
  criteriaResults: jsonb('criteria_results').notNull(), // [{criterion, met, evidence}]
  overallScore: numeric('overall_score'),
  recommendation: text('recommendation'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 5. human_decisions — the actual decision, always tied to a person
// ---------------------------------------------------------------------------
export const humanDecisions = pgTable('human_decisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: uuid('application_id').notNull().references(() => applications.id),
  decidedBy: text('decided_by').notNull(), // Clerk user ID
  decision: text('decision').notNull(), // 'approved' | 'rejected' | 'more_info'
  notes: text('notes'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 6. interview_slots
// ---------------------------------------------------------------------------
export const interviewSlots = pgTable('interview_slots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: uuid('application_id').notNull().references(() => applications.id),
  proposedStart: timestamp('proposed_start', { withTimezone: true }).notNull(),
  proposedEnd: timestamp('proposed_end', { withTimezone: true }).notNull(),
  status: text('status').default('offered').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 7. feedback_summaries
// ---------------------------------------------------------------------------
export const feedbackSummaries = pgTable('feedback_summaries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: uuid('application_id').notNull().references(() => applications.id),
  summaryText: text('summary_text').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 8. audit_log — APPEND-ONLY. Never update, never delete.
// ---------------------------------------------------------------------------
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  applicationId: uuid('application_id').references(() => applications.id),
  actorType: text('actor_type').notNull(), // 'system' | 'llm' | 'human'
  actorId: text('actor_id'),
  action: text('action').notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// 9. token_usage_logs
// ---------------------------------------------------------------------------
export const tokenUsageLogs = pgTable('token_usage_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  callType: text('call_type').notNull(),
  tokensUsed: integer('tokens_used').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
