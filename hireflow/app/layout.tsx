import type { Metadata } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HireFlow — Recruitment Workflow Agent',
  description:
    'An n8n-orchestrated recruitment pipeline that scores resumes against explicit criteria and routes every decision through mandatory human approval.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <ClerkProvider
      signInUrl="/login"
      signUpUrl="/signup"
      afterSignOutUrl="/login"
    >
      <html
        lang="en"
        className={`${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-[#F7F8FA] text-[#1F2933] font-sans">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
