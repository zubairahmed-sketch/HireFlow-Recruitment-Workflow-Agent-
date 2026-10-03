# HireFlow — Recruitment Workflow Agent

> An n8n-orchestrated recruitment pipeline that scores resumes against an explicit rubric, routes every decision through mandatory human approval, and automates scheduling and follow-up — auditable by design, not a black box that rejects people silently.

---

## The Core Thesis

Most "AI recruiting" demos are a resume-in, verdict-out black box. HireFlow's thesis is different:

- **Every score is structured and auditable** — `{criterion, met, evidence}` per rubric line, not an opaque number
- **No candidate-facing action fires without human approval** — the LLM recommends; a person decides
- **n8n's Wait node makes the human-in-the-loop step real**, not simulated — the workflow genuinely pauses until a recruiter clicks Approve/Reject in the dashboard

---

## Architecture

```
[Mock ATS Webhook] → n8n receives new application
     │
     ▼
n8n: POST /api/applications/extract   (resume text extraction)
     │
     ▼
n8n: POST /api/applications/score     (Call 1: structured LLM scoring)
     │
     ▼
n8n: PATCH /api/applications/[id]     (stores resume URL — critical!)
     │
     ▼
n8n: Wait node ◄─── GENUINELY PAUSES HERE
     │
     │  ← Recruiter reviews score breakdown, clicks Approve/Reject
     │    POST /api/applications/[id]/decision → calls n8n resume URL
     │
     ▼
n8n: branches on decision
  ├─ Approved → create interview slots → email candidate
  ├─ Rejected → send rejection email
  └─ More Info → notify candidate
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Workflow orchestration | n8n (self-hosted Docker or n8n Cloud) |
| Frontend/Backend | Next.js 16 (App Router), TypeScript |
| Database + Auth | Supabase (Postgres + RLS + Storage) |
| AI | OpenAI `gpt-4o-mini` — 3 calls only |
| Resume parsing | `pdfjs-dist` (PDF), `mammoth` (DOCX) |
| Email | n8n email nodes (SMTP/Resend) — never from Next.js |

---

## API Routes

| Method | Route | Caller | Purpose |
|---|---|---|---|
| `POST` | `/api/webhooks/application-received` | Mock ATS | New application arrives |
| `POST` | `/api/applications/extract` | n8n | Extract resume text |
| `POST` | `/api/applications/score` | n8n | Score against rubric (Call 1) |
| `GET` | `/api/applications/[id]` | Dashboard | Full detail + audit trail |
| `PATCH` | `/api/applications/[id]` | n8n | Store resume URL |
| `POST` | `/api/applications/[id]/decision` | Dashboard | Record human decision, resume n8n |
| `POST` | `/api/applications/[id]/interview-slots` | n8n | Create offered time slots |
| `GET/POST` | `/api/interviews/[id]/confirm` | Candidate | Select a slot |
| `GET` | `/api/interviews/reminders/pending` | n8n daily | Unconfirmed slots >48h |
| `POST` | `/api/emails/draft` | n8n | Draft email copy (Call 2) |
| `POST` | `/api/feedback/generate` | n8n | Post-interview summary (Call 3) |
| `GET` | `/api/audit/[applicationId]` | Dashboard | Full audit log |

**3 LLM calls total:** resume scoring · email drafting · feedback summary

---

## Setup

### 1. Clone & install

```bash
git clone <repo>
cd hireflow
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### 3. Supabase setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the schema: paste the contents of `hireflow/supabase/schema.sql` into the Supabase SQL editor
3. Create a storage bucket named **`resumes`** (private)
4. Copy your project URL and anon/service role keys to `.env.local`

### 4. n8n setup

**Option A — n8n Cloud (free tier):**
1. Sign up at [n8n.io](https://n8n.io)
2. Import `n8n/workflows/recruitment-pipeline.json`
3. Import `n8n/workflows/reminder-sub-workflow.json`
4. Set environment variables in n8n: `APP_BASE_URL`, `EMAIL_FROM`, `N8N_SERVICE_TOKEN`

**Option B — Docker:**
```bash
docker run -d --name n8n -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  n8nio/n8n
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

---

## Testing the Full Flow

### Submit a test application

```bash
curl -X POST http://localhost:3000/api/webhooks/application-received \
  -H "Content-Type: application/json" \
  -d '{
    "candidate_name": "Jane Smith",
    "candidate_email": "jane@example.com",
    "job_posting_id": "<your-job-id-from-dashboard>",
    "resume_filename": "resume.pdf",
    "resume_base64": "<base64-encoded-pdf>"
  }'
```

### Trigger the n8n pipeline

In n8n, manually trigger the **HireFlow — Recruitment Pipeline** workflow with:
```json
{ "application_id": "<id-from-above-response>" }
```

The workflow will extract, score, then pause at the Wait node. Open the dashboard to review and make a decision.

---

## n8n Workflow Notes

**The most critical step:** Node `HTTP — Store n8n Resume URL` saves `$execution.resumeUrl` to the database **before** the Wait node runs. Without this, a workflow paused for days can never be resumed when a recruiter makes a decision.

**The Wait node is not polling.** The execution genuinely freezes in n8n's database until `/api/applications/[id]/decision` is called, which then POSTs to the saved resume URL.

---

## LLM Constraints

- **Call 1** — `scoreResume.ts` — structured per-criterion scoring with evidence
- **Call 2** — `draftEmail.ts` — email copy draft (human already approved the decision)
- **Call 3** — `generateSummary.ts` — post-interview feedback summary from notes

The LLM never decides what happens next. It assesses and drafts. Humans and deterministic workflow branches decide.

---

## Project Structure

```
hireflow/
├── app/
│   ├── (app)/              # Auth-protected pages
│   │   ├── dashboard/      # Review queue
│   │   ├── applications/   # Application detail + decision UI
│   │   └── jobs/           # Job posting + criteria management
│   ├── api/                # All API routes
│   └── interviews/         # Candidate-facing (no auth)
├── components/
│   ├── decision-panel.tsx  # Approve/Reject/More Info with confirm dialog
│   └── app-navbar.tsx
├── lib/
│   ├── scoring/            # scoreResume.ts, draftEmail.ts
│   ├── feedback/           # generateSummary.ts
│   ├── resume/             # extractText.ts (PDF + DOCX)
│   ├── audit/              # logAction.ts
│   └── openai/             # client.ts, logTokenUsage.ts
└── supabase/
    └── schema.sql          # Full schema with RLS policies

n8n/
└── workflows/
    ├── recruitment-pipeline.json      # Main workflow
    └── reminder-sub-workflow.json     # Daily reminder check
```

---

## CV Talking Points

**Why does the LLM never trigger candidate-facing actions directly?**
Hiring decisions carry real consequences and increasing regulatory scrutiny — a human approving a structured, evidence-backed recommendation is both more defensible and more correct than full automation.

**How does the n8n Wait node actually work here?**
It's not polling — the workflow execution genuinely pauses in n8n's database until a specific webhook path is called, which happens only after a human decision is recorded server-side.

**Why structured per-criterion scoring instead of one number?**
A single score can't be interrogated. "Which criteria did this candidate fail, and why" is the question a human reviewer — or an auditor — actually needs answered.

**Why mock the ATS integration?**
Real ATS API access requires enterprise sales conversations. The webhook is built to the real contract shape so the swap is a config change, not a rebuild.
