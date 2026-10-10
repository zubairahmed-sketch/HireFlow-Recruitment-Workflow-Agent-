import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { applications, candidates } from '@/lib/db/schema';
import { logAction } from '@/lib/audit/logAction';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod/v4';

/**
 * POST /api/webhooks/application-received
 *
 * Mock ATS webhook — receives new application payload.
 * Shape matches what a real ATS (Greenhouse, Workday) would send.
 * No auth — this is a webhook endpoint.
 *
 * The webhook either:
 *   1. Accepts a resume URL (from Uploadthing or any public URL)
 *   2. Accepts base64-encoded resume content (for testing)
 */

const webhookSchema = z.object({
  candidate_name: z.string().min(1),
  candidate_email: z.email(),
  job_posting_id: z.string().uuid(),
  resume_url: z.string().url().optional(),
  resume_filename: z.string().optional(),
  resume_base64: z.string().optional(),
  user_id: z.string().min(1, 'user_id is required for associating the application'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = webhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      candidate_name,
      candidate_email,
      job_posting_id,
      resume_url,
      resume_base64,
      user_id,
    } = parsed.data;

    const db = getDb();

    // 1. Upsert candidate
    const existingCandidates = await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.email, candidate_email),
          eq(candidates.userId, user_id)
        )
      )
      .limit(1);

    let candidateId: string;

    if (existingCandidates.length > 0) {
      candidateId = existingCandidates[0].id;
    } else {
      const [newCandidate] = await db
        .insert(candidates)
        .values({
          userId: user_id,
          fullName: candidate_name,
          email: candidate_email,
        })
        .returning();
      candidateId = newCandidate.id;
    }

    // 2. Determine resume storage path
    let resumeStoragePath = resume_url ?? '';

    if (!resume_url && resume_base64) {
      // For testing: store base64 as a data URL placeholder
      // In production, this would be uploaded to Uploadthing first
      resumeStoragePath = `data:application/pdf;base64,${resume_base64.slice(0, 50)}...`;
    }

    if (!resumeStoragePath) {
      return NextResponse.json(
        { error: 'Either resume_url or resume_base64 is required' },
        { status: 400 }
      );
    }

    // 3. Create application
    const [application] = await db
      .insert(applications)
      .values({
        userId: user_id,
        candidateId,
        jobPostingId: job_posting_id,
        resumeStoragePath,
        status: 'received',
      })
      .returning();

    // 4. Audit log
    await logAction({
      applicationId: application.id,
      actorType: 'system',
      actorId: 'webhook:application-received',
      action: 'application_received',
      details: {
        candidate_name,
        candidate_email,
        job_posting_id,
        has_resume: !!resumeStoragePath,
      },
    });

    return NextResponse.json(
      {
        data: {
          application_id: application.id,
          candidate_id: candidateId,
          status: 'received',
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[webhook] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
