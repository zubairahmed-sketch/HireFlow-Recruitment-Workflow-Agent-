import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/audit/[applicationId]
 * 
 * Returns the complete audit trail for a single application.
 * Every score, decision, email send, and system action, timestamped.
 * 
 * The audit_log table is append-only — no UPDATE or DELETE policies.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  try {
    const { applicationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[audit] Supabase error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch audit log' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[audit] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
