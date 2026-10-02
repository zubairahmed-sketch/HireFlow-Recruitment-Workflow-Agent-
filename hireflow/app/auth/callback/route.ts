import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Supabase OAuth callback handler.
 * After the user authenticates via Supabase (email magic link or OAuth),
 * Supabase redirects here with a code. We exchange it for a session.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If there's no code or the exchange failed, redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
