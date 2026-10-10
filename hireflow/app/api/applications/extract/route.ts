import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { applications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { extractText } from '@/lib/resume/extractText';
import { logAction } from '@/lib/audit/logAction';
import { z } from 'zod/v4';

/**
 * POST /api/applications/extract
 *
 * Called by n8n after a new application is received.
 * Downloads the resume from the stored URL and extracts plain text.
 */

const extractSchema = z.object({
  application_id: z.string().uuid(),
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
    const db = getDb();

    // 1. Get the application
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, application_id))
      .limit(1);

    if (!application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    // 2. Download the resume from the URL
    const resumeUrl = application.resumeStoragePath;
    const response = await fetch(resumeUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to download resume from ${resumeUrl}` },
        { status: 502 }
      );
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());

    // Determine file type from URL or content-type
    const contentType = response.headers.get('content-type') ?? '';
    const isDocx =
      resumeUrl.endsWith('.docx') ||
      contentType.includes('wordprocessingml');

    // 3. Extract text
    const resumeText = await extractText(fileBuffer, isDocx ? 'docx' : 'pdf');

    if (!resumeText || resumeText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text could be extracted from the resume' },
        { status: 422 }
      );
    }

    // 4. Store extracted text
    await db
      .update(applications)
      .set({ resumeText })
      .where(eq(applications.id, application_id));

    // 5. Audit log
    await logAction({
      applicationId: application_id,
      actorType: 'system',
      actorId: 'api:extract',
      action: 'resume_text_extracted',
      details: {
        char_count: resumeText.length,
        source_type: isDocx ? 'docx' : 'pdf',
      },
    });

    return NextResponse.json({
      data: {
        application_id,
        char_count: resumeText.length,
        preview: resumeText.slice(0, 200) + '…',
      },
    });
  } catch (err) {
    console.error('[extract] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
