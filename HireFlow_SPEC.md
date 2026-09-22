# HireFlow — Recruitment Workflow Agent — Build Spec (v1, scoped for a 3–4 week solo build)

**Working name:** HireFlow
**One-liner:** An n8n-orchestrated recruitment pipeline that scores resumes against an explicit rubric, routes every decision through mandatory human approval, and automates the scheduling and follow-up work around that decision — auditable by design, not a black box that rejects people silently.

**A note on scope before you read further:** the original idea describes full Workday/Greenhouse integration. Neither is realistically accessible for a solo portfolio build — both require enterprise sales conversations to even get API credentials. This spec builds against a **mock ATS webhook** with the exact same shape a real one would have (candidate name, email, resume, job ID), so the integration point is a one-line swap later, not a redesign. That's the honest version of "integrates with HR systems," and it's what you'd say in an interview: "built against a real webhook contract, swappable with Greenhouse's actual webhook without touching the workflow logic."

---

## 1. The Problem This Solves

Most "AI recruiting agent" demos are a resume-in, verdict-out black box — paste a resume, get a yes/no. That's also exactly the pattern regulators are increasingly uncomfortable with: automated employment decisions are now subject to real bias-audit requirements in multiple jurisdictions (NYC Local Law 144 is the most cited example), precisely because black-box hiring decisions are hard to defend and easy to get wrong.

This project's actual thesis: **every score is structured and auditable against explicit criteria, and no candidate-facing action ever fires without a human approving it first.** The LLM recommends; a person decides. n8n owns the workflow's state and timing; the LLM is called at narrow, specific decision points — it never freely decides what happens next on its own. That distinction is the whole point, and it's a better, more defensible answer than "the AI handles it end to end."

---

## 2. User Stories

**Rubric & scoring**
- As a recruiter, I want to define explicit scoring criteria per job posting, so candidates are evaluated against stated requirements, not vague AI judgment.
- As a recruiter, I want every resume score to show *which* criteria were met or missed and why, not just a number.

**Human-in-the-loop review**
- As a recruiter, I want to see AI-scored candidates in a review queue and approve or override every decision myself.
- As a recruiter, I want the system to never send a rejection or interview invite without my explicit approval.

**Workflow automation**
- As a recruiter, I want interview scheduling, reminder emails, and follow-ups handled automatically once I've approved a candidate.
- As a candidate, I want a simple way to pick an interview slot from what's offered, without back-and-forth email.

**Feedback & audit**
- As a recruiter, I want a compiled feedback summary after each interview stage.
- As a hiring manager, I want to see the full decision trail for any candidate — score, reasoning, who approved what, when.

*(Slack integration, multi-round interview loops, and a real ATS connector are real future features — section 12 — not v1 requirements.)*

---

## 3. Core Features (MVP Scope)

| # | Feature |
|---|---|
| 1 | Job posting setup with explicit, structured scoring criteria (not free text) |
| 2 | Mock ATS webhook receiving new applications (candidate + resume + job ID) |
| 3 | Resume text extraction (PDF/DOCX) |
| 4 | Structured resume scoring against the job's rubric, with per-criterion reasoning |
| 5 | Human review dashboard — recruiters see scored candidates, approve/reject/request-more-info |
| 6 | n8n-orchestrated interview scheduling once a candidate is approved |
| 7 | Automated follow-up reminders (candidate hasn't picked a slot, interview coming up) |
| 8 | Rejection and interview-invite emails — sent only after human approval |
| 9 | Post-interview structured feedback summary generation |
| 10 | Full audit log — every score, every human decision, every automated action, timestamped |

---

## 4. Architecture — n8n Owns the Workflow, the LLM Owns Narrow Decisions

### Flow

```
[Mock ATS Webhook] -> n8n receives new application
     |
     v
n8n: HTTP Request -> POST /api/applications/extract
     |   (Next.js backend: parse resume PDF/DOCX -> plain text, store in Supabase)
     v
n8n: HTTP Request -> POST /api/applications/score
     |   (Next.js backend: assembles job rubric + resume text -> Call 1: LLM scores
     |    against EXPLICIT criteria, returns structured JSON per criterion, not a single verdict)
     v
Score + reasoning stored in Supabase, application status = 'pending_review'
     |
     v
n8n: Wait node -- pauses here until a webhook fires
     |
     |   <-- Recruiter opens the dashboard, reviews score + reasoning, clicks
     |       Approve / Reject / Request More Info
     |       Next.js backend records the decision, THEN calls n8n's resume-webhook
     |
     v
n8n: resumes, branches on the recorded decision
     |
     +-- Approved --> send interview-slot email, create interview_slots rows,
     |                 schedule a reminder workflow (n8n Wait + conditional check)
     |
     +-- Rejected --> send rejection email (template + optional LLM-personalized
     |                 closing line, still human-approved before send)
     |
     +-- More Info --> notify candidate, pause workflow for their response
     |
     v
Every action (score generated, decision recorded, email sent) written to audit_log
```

### Why this matters technically

- **n8n's "Wait for Webhook" node is what makes the human-in-the-loop pattern real, not simulated.** The workflow genuinely pauses — it isn't polling, it isn't a fake delay — until the dashboard's API call resumes it. This is a specific, correct n8n pattern worth naming explicitly in an interview, not just "I used n8n for automation."
- **The LLM never decides what happens next.** It scores against criteria you defined, and drafts email copy. The *decision* about whether a candidate advances is either a human click or a deterministic branch on that recorded human click — never an LLM output directly triggering a candidate-facing action.
- **Structured criteria beat a single score.** Storing `{criterion: "3+ years React", met: true, evidence: "..."}` per rubric line, rather than one opaque "78/100," is what makes a decision defensible after the fact — to a candidate who asks why, or to an auditor asking the same question at scale.
- **The mock webhook is a deliberate seam, not a shortcut.** It's built to the shape a real ATS webhook has specifically so swapping it later is a config change, not a rewrite — worth stating exactly that way if asked why it's mocked.

---

## 5. Database Schema (Supabase / Postgres)

```sql
-- job_postings: the explicit rubric lives here, not in a prompt
job_postings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  title text not null,
  description text,
  criteria jsonb not null,        -- [{name, description, weight}] -- explicit, structured
  is_active boolean default true,
  created_at timestamptz default now()
);

-- candidates
candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  full_name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- applications: one candidate applying to one job posting
applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  candidate_id uuid references candidates(id),
  job_posting_id uuid references job_postings(id),
  resume_storage_path text not null,
  resume_text text,                -- extracted plain text
  status text default 'received',  -- received | scored | pending_review | approved | rejected | more_info | interview_scheduled
  created_at timestamptz default now()
);

-- resume_scores: structured, per-criterion -- the auditability layer
resume_scores (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id),
  criteria_results jsonb not null, -- [{criterion, met: bool, evidence: string}]
  overall_score numeric,
  recommendation text,             -- 'advance' | 'reject' | 'unclear' -- a suggestion, not a decision
  created_at timestamptz default now()
);

-- human_decisions: the actual decision, always tied to a person
human_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id),
  decided_by uuid references auth.users,
  decision text not null,          -- 'approved' | 'rejected' | 'more_info'
  notes text,
  decided_at timestamptz default now()
);

-- interview_slots: simple scheduling, no external calendar dependency required
interview_slots (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id),
  proposed_start timestamptz not null,
  proposed_end timestamptz not null,
  status text default 'offered',   -- offered | confirmed | declined
  created_at timestamptz default now()
);

-- feedback_summaries
feedback_summaries (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id),
  summary_text text not null,
  generated_at timestamptz default now()
);

-- audit_log: every action, every actor, every timestamp
audit_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id),
  actor_type text not null,        -- 'system' | 'llm' | 'human'
  actor_id text,                   -- user id if human, model name if llm
  action text not null,            -- 'resume_scored' | 'decision_recorded' | 'email_sent' | ...
  details jsonb,
  created_at timestamptz default now()
);

-- token_usage_logs
token_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  call_type text not null,         -- 'resume_scoring' | 'email_drafting' | 'feedback_summary'
  tokens_used int not null,
  created_at timestamptz default now()
);
```

RLS on every table, `user_id = auth.uid()`. `audit_log` should be append-only from the application layer — never expose an UPDATE or DELETE policy on it, even to the owning user; that's what makes it a real audit trail rather than an editable log.

---

## 6. Backend Architecture

### Folder Structure

```
/app
  /api
    /webhooks/application-received/route.ts   -> mock ATS webhook receiver (n8n calls this)
    /applications/extract/route.ts            -> POST, resume text extraction (n8n calls this)
    /applications/score/route.ts              -> POST Call 1, structured rubric scoring (n8n calls this)
    /applications/[id]/decision/route.ts      -> POST human decision, then calls n8n resume-webhook
    /applications/[id]/route.ts               -> GET full application detail + audit trail
    /jobs/route.ts                            -> GET/POST job postings + criteria
    /interviews/[id]/confirm/route.ts         -> POST candidate confirms a slot
    /feedback/generate/route.ts               -> POST Call 2, post-interview summary
    /audit/[applicationId]/route.ts           -> GET full audit log for one application
  /dashboard/page.tsx                         -> review queue
  /applications/[id]/page.tsx                 -> single candidate detail + decision UI
  /jobs/page.tsx                              -> rubric management
/lib
  /supabase/client.ts, server.ts
  /openai/client.ts
  /resume/extractText.ts        -> pdfjs-dist extraction, reused pattern from AskMyDocs
  /scoring/scoreResume.ts       -> Call 1: structured rubric scoring
  /scoring/draftEmail.ts        -> Call 2: rejection/interview email drafting (still human-reviewed)
  /feedback/generateSummary.ts  -> Call 3: post-interview summary
  /audit/logAction.ts           -> single helper, called after every meaningful action
/n8n
  /workflows/recruitment-pipeline.json   -> exported n8n workflow, versioned in the repo
```

### API Routes

| Method | Route | Called by | Purpose |
|---|---|---|---|
| POST | `/api/webhooks/application-received` | Mock ATS / n8n | New application arrives |
| POST | `/api/applications/extract` | n8n | Extract resume text |
| POST | `/api/applications/score` | n8n | Score against rubric (Call 1) |
| GET | `/api/applications/[id]` | Dashboard | Full detail + scores + audit trail |
| POST | `/api/applications/[id]/decision` | Dashboard | Record human decision, resume n8n |
| GET/POST | `/api/jobs` | Dashboard | Manage job postings and criteria |
| POST | `/api/interviews/[id]/confirm` | Candidate-facing page | Confirm a slot |
| POST | `/api/feedback/generate` | n8n, post-interview | Generate structured summary (Call 3) |
| GET | `/api/audit/[applicationId]` | Dashboard | Full audit log |

### Data Flow — "New application to human review"

1. Mock webhook (or n8n's schedule/manual trigger for testing) POSTs a new application payload.
2. n8n's first node calls `/api/applications/extract` — resume text pulled from the stored file, saved to `applications.resume_text`.
3. n8n calls `/api/applications/score` — backend assembles the job's `criteria` array + resume text into the scoring prompt (Call 1), parses structured JSON output, inserts a `resume_scores` row, sets `applications.status = 'pending_review'`.
4. n8n hits a **Wait node**, listening for a specific webhook path unique to this application.
5. A recruiter opens `/applications/[id]`, sees the score, criteria breakdown, and evidence. Clicks Approve, Reject, or Request More Info.
6. `/api/applications/[id]/decision` inserts into `human_decisions`, logs to `audit_log`, **then calls n8n's resume-webhook** for that application's paused workflow.
7. n8n resumes, branches on the decision value, and either sends the interview-slot email, the rejection email, or the more-info request — every send also logged to `audit_log`.

### Data Flow — "Interview scheduling and reminders"

1. On approval, n8n creates 2–3 `interview_slots` rows (simple available-time logic — no external calendar API required for v1) and emails the candidate a link to `/interviews/[id]/confirm`.
2. Candidate picks a slot → `interview_slots.status = 'confirmed'`.
3. n8n's reminder sub-workflow runs on a schedule (e.g., daily), checking for slots with `status = 'offered'` older than 48 hours with no response, and sends a follow-up reminder — logged the same way as every other action.

---

## 7. Frontend UI / UX Design

### Design System
- **Tone:** operational and trustworthy — this is a tool recruiters use daily, not a flashy demo. Clean, dense-but-readable, closer to an admin dashboard than a consumer app.
- **Palette:** neutral background (`#F7F8FA`), one accent — deep teal (`#0F6E5C`) or slate blue (`#334E68`) — charcoal text (`#1F2933`).
- **Typography:** "Inter" throughout, monospace ("IBM Plex Mono") for the audit log timestamps and IDs specifically, to visually reinforce "this is a precise record."
- **Components:** shadcn/ui (Table, Card, Badge, Tabs, Dialog, Separator).

### Pages

**`/dashboard`** — review queue as a table: candidate name, job title, overall score, recommendation badge (color-coded), status, "Review" action. Sortable by score, filterable by job and status.

**`/applications/[id]`** — the core screen. Left: resume text (or embedded PDF viewer) and candidate info. Right: score breakdown — every criterion as a row with a met/not-met badge and the evidence sentence the model cited. Below that: **Approve / Reject / Request More Info** buttons, requiring a confirming click (not a single accidental tap) since this is the action that sends real emails. Bottom: full audit trail for this application, chronological, showing every system, LLM, and human action with timestamps.

**`/jobs`** — job posting list + a form to define criteria as structured rows (name, description, weight) rather than a single text box — the UI itself should make it hard to define a vague, unstructured rubric.

**`/interviews/[id]/confirm`** (candidate-facing, no auth required, accessed via emailed link) — shows 2–3 offered time slots, one-click confirm.

### Mobile
Single column below 768px. The score-breakdown table becomes stacked cards instead of a table. Audit log becomes a collapsible section rather than always-visible, to keep the primary decision action above the fold.

---

## 8. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Workflow orchestration | n8n (self-hosted via Docker, or n8n Cloud free tier) | This is the actual skill being demonstrated — the workflow state, timing, and notification logic genuinely belong here, not hand-rolled |
| Frontend/Backend | Next.js 14+ (App Router), TypeScript | Consistent with the rest of the portfolio — same auth, same deploy pattern |
| Styling | TailwindCSS + shadcn/ui | Fast, consistent component language |
| Database + Auth | Supabase (Postgres + Auth + RLS) | Same as every other project — one investment, reused |
| AI | OpenAI API, `gpt-4o-mini` for scoring and drafting | Structured JSON output for scoring is a small, cheap, well-suited task for the mini model |
| Resume parsing | `pdfjs-dist` (PDF), `mammoth` (DOCX) | Reuses the extraction pattern already proven in AskMyDocs for PDFs; mammoth is the standard, reliable DOCX-to-text library |
| Email | n8n's native email nodes (SMTP or a free-tier provider like Resend) | Keeps notification delivery inside the orchestration layer where it belongs, rather than building a second email system in the Next.js app |
| Deployment | Vercel (app) + Supabase Cloud (DB) + n8n Cloud or a small Docker host for n8n | n8n Cloud has a usable free tier for a portfolio project; self-hosting via Docker is the free alternative if preferred |

---

## 9. Prompts

**Resume scoring (Call 1) — system prompt:**
> You are scoring a candidate's resume against explicit job criteria. You do not make hiring decisions — you assess evidence.
> For each criterion listed below, determine whether the resume provides evidence it is met. Return JSON only:
> `{ "criteria_results": [ { "criterion": string, "met": boolean, "evidence": string } ], "overall_score": number (0-100), "recommendation": "advance" | "reject" | "unclear" }`
> "evidence" must quote or closely paraphrase the specific part of the resume that supports your judgment, or state "No evidence found" if the criterion isn't addressed. Do not infer qualifications beyond what the resume states. "recommendation" is a suggestion for a human reviewer, not a decision.
>
> Criteria: {job.criteria}
> Resume: {resume_text}

**Email drafting (Call 2) — system prompt:**
> Draft a {decision_type} email to a job candidate, professional and warm in tone, 100–150 words. This draft will be reviewed by a human before sending — write it as a strong starting point, not a final send-ready message. Do not fabricate specific feedback not present in the provided context.

**Feedback summary (Call 3) — system prompt:**
> Summarize this interview stage into a structured note for the hiring team: key strengths observed, concerns raised, and a recommendation for next steps. Base this only on the notes provided — do not invent details.

---

## 10. Build Phases

| Phase | Scope | Est. time |
|---|---|---|
| 1 | Auth, job posting + criteria management, Supabase schema + RLS | 3–4 days |
| 2 | Mock webhook receiver, resume extraction, resume scoring (Call 1) | 4–5 days |
| 3 | n8n workflow: webhook trigger → extract → score → Wait node, tested end to end with a stub decision | 3–4 days |
| 4 | Review dashboard UI, decision recording, n8n resume-webhook wiring | 4–5 days |
| 5 | Interview scheduling flow, candidate confirm page, reminder sub-workflow | 3–4 days |
| 6 | Email sending (n8n), feedback summary generation, audit log UI, deploy | 3–4 days |

~3–4 weeks part-time. Phases 1–4 alone already prove the core thesis (structured scoring + human-gated decisions) — ship those first if time is tight.

---

## 11. Future Work (real ideas, deliberately not v1)

- **Real ATS webhook integration** (Greenhouse or Workday) — swap the mock webhook for the real one; the payload contract was designed for exactly this.
- **Slack notifications** alongside email, using n8n's Slack node — trivial to add given the orchestration layer already exists.
- **Multi-round interview loops** — a second and third interview stage, each with its own scoring/feedback cycle.
- **Bias-audit reporting** — aggregate `resume_scores` by demographic-blind criteria-pass-rates over time, the kind of report NYC Local Law 144-style audits actually require. A strong, differentiated future feature given the project's whole thesis.
- **Calendar API integration** (Google Calendar / Outlook) replacing the simple offered-slots table.

---

## 12. CV Bullet & Interview Talking Points

**CV bullet:**
> Built an n8n-orchestrated recruitment workflow agent that scores resumes against explicit, structured criteria and routes every candidate-facing decision through mandatory human approval — using n8n's webhook-pause pattern to make the human-in-the-loop step real rather than simulated, with a full audit trail across every automated and human action.

**Be ready to answer:**
1. Why does the LLM never trigger a candidate-facing action directly? *(Hiring decisions carry real consequences and increasing regulatory scrutiny — a human approving a structured, evidence-backed recommendation is both more defensible and more correct than full automation.)*
2. How does the n8n Wait node actually work here? *(It's not polling — the workflow execution genuinely pauses until a specific webhook path is called, which happens only after a human decision is recorded server-side.)*
3. Why structured per-criterion scoring instead of one number? *(A single score can't be interrogated. "Which criteria did this candidate fail, and why" is the question a human reviewer — or an auditor — actually needs answered.)*
4. Why mock the ATS integration instead of building against a real one? *(Real ATS API access requires enterprise sales conversations solo developers can't get. The webhook is built to the real contract shape specifically so the swap is a config change, not a rebuild.)*

---

## 13. How to Use This With Copilot

Save as `SPEC.md` at your repo root. In Copilot Chat:

> Using SPEC.md as the reference, scaffold a Next.js 14 App Router project with TypeScript, TailwindCSS, and Supabase auth. Start with Phase 1: job posting management with structured criteria, and the database schema from section 5.

Set up n8n separately (Docker or n8n Cloud) once Phase 2's API endpoints exist for it to call — building the workflow against endpoints that don't exist yet just means debugging blind.
