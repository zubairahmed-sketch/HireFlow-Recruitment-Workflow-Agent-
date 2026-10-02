import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppNavbar } from '@/components/app-navbar';

/**
 * Layout for all authenticated pages (dashboard, jobs, applications, etc.).
 * Provides the top navigation bar and handles auth redirect.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AppNavbar userEmail={user.email ?? ''} />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
