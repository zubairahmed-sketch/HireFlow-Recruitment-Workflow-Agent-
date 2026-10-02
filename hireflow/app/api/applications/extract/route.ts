import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { extractResumeText } from '@/lib/resume/extractText';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * POST /api/applications/extract
 * 
 * Called by n8n after a new application is received.
 * Downloads the resume from Supabase Storage, extracts plain text,
 * and stores it in applications.resume_text.
 * 
 * This route does one bounded thing and returns — per Rule 1.
 */

const extractSchema = z.object({
  application_id: z.string().uuid('Valid application ID is required'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = extractSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { application_id } = parsed.data;
    const supabase = createServiceRoleClient();

    // 1. Fetch the application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, resume_storage_path, resume_text, user_id')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    // Skip extraction if already done
    if (application.resume_text) {
      return NextResponse.json({
        data: {
          application_id,
          resume_text: application.resume_text,
          already_extracted: true,
        },
      });
    }

    // 2. Download the resume from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('resumes')
      .download(application.resume_storage_path);

    if (downloadError || !fileData) {
      console.error('[extract] Failed to download resume:', downloadError?.message);
      return NextResponse.json(
        { error: 'Failed to download resume from storage' },
        { status: 500 }
      );
    }

    // 3. Extract text from the resume file
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = application.resume_storage_path.split('/').pop() || 'resume.pdf';

    const resumeText = await extractResumeText(buffer, fileName);

    // 4. Store the extracted text
    const { error: updateError } = await supabase
      .from('applications')
      .update({ resume_text: resumeText })
      .eq('id', application_id);

    if (updateError) {
      console.error('[extract] Failed to store resume text:', updateError.message);
      return NextResponse.json(
        { error: 'Failed to store extracted text' },
        { status: 500 }
      );
    }

    // 5. Audit log
    await logAction({
      supabase,
      applicationId: application_id,
      actorType: 'system',
      actorId: 'api:extract',
      action: 'resume_text_extracted',
      details: {
        text_length: resumeText.length,
        file_name: fileName,
      },
    });

    return NextResponse.json({
      data: {
        application_id,
        resume_text: resumeText,
        already_extracted: false,
      },
    });
  } catch (err) {
    console.error('[extract] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
