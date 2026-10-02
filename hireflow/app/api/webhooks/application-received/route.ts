import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * POST /api/webhooks/application-received
 * 
 * Mock ATS webhook receiver — built to the exact shape a real Greenhouse or
 * Workday webhook would send, so swapping in a real ATS later is a config
 * change, not a rewrite.
 * 
 * Per Rule 6: Accepts {candidate_name, candidate_email, resume_file, job_posting_id}.
 * Per Rule 7: This route does NOT send emails — that's n8n's job.
 * 
 * This is a PUBLIC endpoint (no auth required) — n8n or the real ATS calls it.
 * Uses the service role client to bypass RLS for system-level writes.
 */

const applicationWebhookSchema = z.object({
  candidate_name: z.string().min(1, 'Candidate name is required'),
  candidate_email: z.string().email('Valid candidate email is required'),
  job_posting_id: z.string().uuid('Valid job posting ID is required'),
  // resume_file is expected as base64-encoded content with filename
  resume_filename: z.string().min(1, 'Resume filename is required'),
  resume_base64: z.string().min(1, 'Resume file content (base64) is required'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = applicationWebhookSchema.safeParse(body);

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
      resume_filename,
      resume_base64,
    } = parsed.data;

    const supabase = createServiceRoleClient();

    // 1. Verify the job posting exists
    const { data: jobPosting, error: jobError } = await supabase
      .from('job_postings')
      .select('id, user_id')
      .eq('id', job_posting_id)
      .eq('is_active', true)
      .single();

    if (jobError || !jobPosting) {
      return NextResponse.json(
        { error: 'Job posting not found or inactive' },
        { status: 404 }
      );
    }

    // 2. Create or find the candidate (upsert by email within this user's scope)
    const { data: existingCandidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('email', candidate_email)
      .eq('user_id', jobPosting.user_id)
      .single();

    let candidateId: string;

    if (existingCandidate) {
      candidateId = existingCandidate.id;
    } else {
      const { data: newCandidate, error: candidateError } = await supabase
        .from('candidates')
        .insert({
          user_id: jobPosting.user_id,
          full_name: candidate_name,
          email: candidate_email,
        })
        .select('id')
        .single();

      if (candidateError || !newCandidate) {
        console.error(
          '[webhook] Failed to create candidate:',
          candidateError?.message
        );
        return NextResponse.json(
          { error: 'Failed to create candidate record' },
          { status: 500 }
        );
      }
      candidateId = newCandidate.id;
    }

    // 3. Upload the resume to Supabase Storage
    const fileBuffer = Buffer.from(resume_base64, 'base64');
    const storagePath = `resumes/${jobPosting.user_id}/${candidateId}/${Date.now()}_${resume_filename}`;

    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(storagePath, fileBuffer, {
        contentType: resume_filename.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadError) {
      console.error('[webhook] Failed to upload resume:', uploadError.message);
      return NextResponse.json(
        { error: 'Failed to upload resume file' },
        { status: 500 }
      );
    }

    // 4. Create the application record
    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert({
        user_id: jobPosting.user_id,
        candidate_id: candidateId,
        job_posting_id,
        resume_storage_path: storagePath,
        status: 'received',
      })
      .select('id')
      .single();

    if (appError || !application) {
      console.error(
        '[webhook] Failed to create application:',
        appError?.message
      );
      return NextResponse.json(
        { error: 'Failed to create application record' },
        { status: 500 }
      );
    }

    // 5. Audit log
    await logAction({
      supabase,
      applicationId: application.id,
      actorType: 'system',
      actorId: 'webhook:application-received',
      action: 'application_received',
      details: {
        candidate_name,
        candidate_email,
        job_posting_id,
        resume_filename,
        storage_path: storagePath,
      },
    });

    // 6. Return the application ID — n8n uses this for subsequent calls
    return NextResponse.json(
      {
        data: {
          application_id: application.id,
          candidate_id: candidateId,
          job_posting_id,
          status: 'received',
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[webhook] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
