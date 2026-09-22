# Using n8n for HireFlow — Practical Setup Guide

## 1. Get n8n running

**Recommended for this project: self-hosted via Docker.** Zero cost, no account limits, and it's the option already specified in `HireFlow_SPEC.md`.

```bash
docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Open `http://localhost:5678` once it's running. Create your owner account on first launch — this is local to your machine, not a cloud signup.

Alternative: n8n Cloud (n8n.io) if you'd rather skip managing Docker — sign up and you get a hosted instance instantly. Either way, the workflow you build is identical; only where it runs differs. Check n8n's current pricing page yourself before committing, since I don't want to quote you a number that's gone stale by the time you sign up.

## 2. Build the workflow, node by node

This maps directly to SPEC.md section 4. Build it in this order so you can test incrementally rather than wiring the whole thing blind.

**Node 1 — Webhook (trigger)**
Add a Webhook node. Set the HTTP Method to `POST`, path to something like `application-received`. This is your mock ATS entry point — copy the "Production URL" it generates once you're ready to test for real; the "Test URL" only works while you're actively watching the editor.

**Node 2 — HTTP Request: extract**
Add an HTTP Request node. POST to your backend's `/api/applications/extract`, passing along the webhook's incoming data (candidate info, resume reference) in the body.

**Node 3 — HTTP Request: score**
Another HTTP Request node, POST to `/api/applications/score`. This is where Call 1 (the LLM scoring) actually happens — but it happens in your Next.js backend, not in n8n. n8n is just triggering it and waiting for the result.

**Node 4 — HTTP Request: store the resume URL (the step it's easy to miss)**
Before you add the Wait node, add one more HTTP Request node here. This is the detail that makes the human-in-the-loop pattern actually work: the Wait node's resume URL (`{{$execution.resumeUrl}}`) needs to be sent to your backend and saved — for example, `PATCH /api/applications/[id]` with `{ "n8n_resume_url": "{{$execution.resumeUrl}}" }` stored on the `applications` row.

Why this matters: once the Wait node pauses, that execution is frozen. The *only* way to resume it later is to call that exact URL. If you don't save it somewhere your backend can find it when a recruiter clicks "Approve" days later, you have no way to resume the workflow — the pause becomes permanent. This is the single most common way this pattern breaks for people new to n8n.

**Node 5 — Wait**
Add the Wait node. Set **Resume On** to "On Webhook Call." Leave authentication off for a first working version (add Header Auth once it's working end to end — don't debug auth and logic at the same time).

**Node 6 — IF (or Switch)**
After the Wait node resumes, the data sent in *that* resume call is what's available here — this should be the recorded decision (`approved` / `rejected` / `more_info`). Add an IF or Switch node branching on that value.

**Nodes 7a/7b/7c — Email (per branch)**
One Email node (or Send Email / SMTP node, or a Resend/SendGrid node if you'd rather not deal with raw SMTP) per branch: interview-invite email, rejection email, more-info email.

## 3. How the backend actually resumes it

Per SPEC.md, your `/api/applications/[id]/decision` route does three things in order: insert the `human_decisions` row, log to `audit_log`, then make an HTTP call to the saved `n8n_resume_url` — with the decision value in the request body, since that's what Node 6's IF/Switch reads.

```ts
await fetch(application.n8n_resume_url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ decision: decision.decision }),
});
```

## 4. Test it before wiring real email sends

1. Manually trigger the webhook (Postman, curl, or n8n's own "Listen for Test Event") with a fake application payload.
2. Confirm it runs through extract → score → stores the resume URL → hits Wait, and genuinely pauses — you'll see the execution sitting in n8n's Executions tab as "Waiting."
3. Manually POST to the saved resume URL yourself (curl is fine) with a fake decision body, and confirm the workflow actually resumes and branches correctly.
4. Only once that full loop works should you wire in real email sending and real backend calls.

## 5. Save it into your repo

Once it works: in n8n, select all nodes → copy, or use the workflow menu's export option to download the workflow JSON. Save it at `/n8n/workflows/recruitment-pipeline.json` in your HireFlow repo, exactly as SPEC.md section 6 specifies — this is a real deliverable, not an optional extra, since it's how anyone (including an interviewer) can see the actual orchestration logic without you having n8n open live.
