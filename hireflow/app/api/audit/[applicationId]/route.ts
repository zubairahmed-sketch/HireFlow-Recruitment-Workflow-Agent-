import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/audit/[applicationId]
 * Returns the full audit trail for one application.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  try {
    const { applicationId } = await params;
    const db = getDb();

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.applicationId, applicationId));

    return NextResponse.json({ data: entries });
  } catch (err) {
    console.error('[audit] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
