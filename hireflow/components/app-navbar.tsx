'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Briefcase, LogOut } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Job Postings', icon: Briefcase },
];

export function AppNavbar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E4E7EB] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="w-full max-w-7xl mx-auto flex h-14 items-center px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded-lg bg-[#0F6E5C] flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <span className="font-bold text-[#1F2933] text-lg tracking-tight hidden sm:inline-block">
            HireFlow
          </span>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${
                    isActive
                      ? 'bg-[#E6F7F3] text-[#0F6E5C]'
                      : 'text-[#627D98] hover:text-[#1F2933] hover:bg-[#F0F4F8]'
                  }
                `}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side: user info + sign out */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-[#627D98] font-mono hidden md:inline-block">
            {userEmail}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-[#627D98] hover:text-[#1F2933] gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
