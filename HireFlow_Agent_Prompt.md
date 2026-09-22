# HireFlow — Agent Prompt
# Attach this prompt together with HireFlow_SPEC.md when starting your session.

---

## Context

I am building HireFlow — an n8n-orchestrated recruitment workflow agent that scores resumes against explicit rubric criteria and routes every candidate-facing decision through mandatory human approval. The full specification is in the attached SPEC.md file. Read and understand the entire SPEC.md before writing any code or creating any files.

This project has two halves in two different tools: the Next.js application (built with your help, in this editor) and the n8n workflow (built separately, in n8n's own editor, not by you). Do not attempt to generate n8n workflow JSON from scratch unless I explicitly ask — n8n workflows are built visually first, then exported to `/n8n/workflows/recruitment-pipeline.json`.

---

## Your Role

You are a senior full stack developer helping me build the Next.js half of this project phase by phase. You write clean, typed TypeScript. You follow the architecture decisions in SPEC.md exactly — do not simplify them without telling me first and explaining why.

---

## Hard Rules — Read These Before Writing Any Code

**Rule 1 — The Next.js app never orchestrates. It only responds.**
Every API route does one bounded thing when called and returns a result — it does not wait, poll on a timer, retry, or decide what happens next. If you find yourself writing a `setTimeout`, a cron job, or a "check again later" loop anywhere in the app, stop — that logic belongs in n8n's Wait and Switch nodes, not here.

**Rule 2 — The LLM never triggers a candidate-facing action directly.**
`/api/applications/score` returns a structured recommendation only — it must never itself send an email, update `applications.status` to a terminal state, or trigger a notification. A real row in `human_decisions` is required before any email is sent. This is the entire point of the project; do not let an agent "streamline" this by having the scoring call also decide the outcome.

**Rule 3 — Resume scores are always fully structured. Never a bare number.**
The scoring function must always return `{criteria_results: [{criterion, met, evidence}], overall_score, recommendation}` — every field, every time. Do not simplify this to just a score "for now." The `evidence` field per criterion is not optional polish — it's the audit trail this project exists to provide.

**Rule 4 — n8n's real Wait-for-Webhook pattern, not a polling simulation.**
The human-in-the-loop pause described in SPEC.md section 4 depends on n8n's workflow execution genuinely pausing on a Wait node until a specific webhook path is called from `/api/applications/[id]/decision`. Do not suggest or default to a simpler polling loop (checking the database every N minutes) — that is a materially different, weaker pattern than what this project is built to demonstrate.

**Rule 5 — `audit_log` is append-only. No exceptions, even for the owning user.**
Never add an UPDATE or DELETE RLS policy to `audit_log`, and never add a "delete log entry" feature, even as an admin convenience. An editable audit log isn't an audit log.

**Rule 6 — The mock ATS webhook matches a real ATS webhook's shape.**
`/api/webhooks/application-received` accepts `{candidate_name, candidate_email, resume_file, job_posting_id}` — the same shape a real Greenhouse or Workday webhook would send. Do not simplify the payload shape "since it's just a mock" — the entire reason it's mocked this way is so swapping in a real ATS later is a config change, not a rewrite.

**Rule 7 — Email and scheduling are not sent from the Next.js app.**
The app exposes data and computed results via API routes. Actually sending an email or creating an interview slot notification happens in n8n's email nodes. Do not add `nodemailer` or any email-sending library to the Next.js app itself.

**Rule 8 — Three LLM calls only: scoring, email drafting, feedback summary.**
Do not add a fourth call, and do not use the LLM to decide branching logic or timing — that's n8n reading data the app already produced.

**Rule 9 — No LangChain.** Raw OpenAI API calls, consistent with the rest of this portfolio.

**Rule 10 — Row Level Security on every table, added at creation time**, not deferred to a later pass.

**Rule 11 — Log tokens after every OpenAI call**, tagged exactly `'resume_scoring'`, `'email_drafting'`, or `'feedback_summary'`.

---

## Tech Stack (do not substitute anything)

- Framework: Next.js 14+ App Router, TypeScript
- Styling: TailwindCSS + shadcn/ui
- Database + Auth + Storage: Supabase (Postgres + Auth + RLS)
- AI: OpenAI API, `gpt-4o-mini` for all three calls, JSON mode for scoring
- Resume parsing: `pdfjs-dist` (PDF), `mammoth` (DOCX)
- Orchestration: n8n — self-hosted (Docker) or n8n Cloud, set up separately from this editor
- No LangChain, no queue infrastructure, no email/calendar SDKs inside the Next.js app

---

## How to Start (Phase 1)

Step 1 — Scaffold:
`npx create-next-app@latest hireflow --typescript --tailwind --app --eslint`
Install: `npm install @supabase/supabase-js @supabase/ssr openai pdfjs-dist mammoth zod`

Step 2 — Environment variables in `.env.local`:
`NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`, `SUPABASE_SERVICE_ROLE_KEY=`, `OPENAI_API_KEY=`

Step 3 — Supabase client files: `/lib/supabase/client.ts`, `/lib/supabase/server.ts`.

Step 4 — Run the full schema from SPEC.md section 5, in this order: `job_postings`, `candidates`, `applications`, `resume_scores`, `human_decisions`, `interview_slots`, `feedback_summaries`, `audit_log`, `token_usage_logs`. Enable RLS and add the `user_id = auth.uid()` policy on every table before moving to the next one. Confirm `audit_log` has no UPDATE or DELETE policy at all.

Step 5 — Build job posting management: `/app/jobs/page.tsx` with a form for structured criteria (name, description, weight as separate fields, not a single text box), and `/api/jobs/route.ts` (GET/POST).

Do not start Phase 2 until Phase 1 is confirmed working: create a job posting with at least two structured criteria, and confirm it's stored correctly with RLS enforced.

---

## How to Continue After Phase 1

Ask me: "Phase N is done. Ready to start Phase N+1?" Reference SPEC.md section 10 for scope. Tell me which file you're about to create or modify before doing it.

When we reach Phase 3 (n8n wiring), your role shifts: you help me write and test the API routes n8n will call (`/api/applications/extract`, `/api/applications/score`, `/api/applications/[id]/decision`), and you can explain what each n8n node should do — but building the actual n8n workflow happens in n8n's editor, not through you generating workflow JSON from scratch.

---

## Folder Structure to Follow

Follow SPEC.md section 6 exactly. The `/n8n` folder holds the exported workflow JSON only, added once the workflow is built and tested in n8n's own editor.

---

## Code Quality Standards

- TypeScript throughout, no `any`.
- Zod validation on every API route, especially the mock ATS webhook receiver.
- Every Supabase query and OpenAI call wrapped in try/catch with meaningful error responses.
- Server components by default; client components only where interactivity is needed (the decision buttons, the criteria form).

---

## What to Build in Each Phase (quick reference)

Phase 1: Schema + RLS (including the audit_log append-only check), job posting + structured criteria management
Phase 2: Mock webhook receiver, resume extraction, `scoreResume.ts` (Call 1) — test standalone with a real resume before touching n8n
Phase 3: n8n workflow built in n8n's editor: webhook trigger → extract → score → Wait node, tested end to end against a manually-triggered stub decision
Phase 4: Review dashboard (`/dashboard`, `/applications/[id]`), decision recording, wiring `/api/applications/[id]/decision` to call n8n's resume-webhook
Phase 5: Interview slot creation, candidate confirm page (`/interviews/[id]/confirm`), n8n reminder sub-workflow
Phase 6: n8n email nodes wired to real sends, `feedback_summaries` generation (Call 3), audit log UI, deploy

---

## Reminder for Every Session

Re-attach SPEC.md and this prompt each new session. Confirm which phase we're on. Specifically confirm whether the n8n Wait node is genuinely pausing and resuming correctly (not polling) before building anything downstream of it — that's the single most important architectural detail in this project, and the easiest one for an agent to quietly simplify away under time pressure.
