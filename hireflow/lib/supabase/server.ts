import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component where
            // cookies cannot be set. This is expected when middleware refreshes
            // the session — the call can be safely ignored.
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase client using the service role key.
 * Bypasses RLS — use ONLY in API routes where system-level access is needed
 * (e.g., n8n webhook handlers that act as the system, not a user).
 */
export function createServiceRoleClient() {
  // Import directly to avoid async cookie handling
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
