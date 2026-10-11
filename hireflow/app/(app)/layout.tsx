import { AppNavbar } from '@/components/app-navbar';

/**
 * Layout for all authenticated pages (dashboard, jobs, applications, etc.).
 * Clerk middleware handles auth redirect — no manual check needed here.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <AppNavbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
