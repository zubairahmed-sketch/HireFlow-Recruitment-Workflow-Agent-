import { redirect } from 'next/navigation';

/**
 * Root page — redirects to the dashboard.
 * Unauthenticated users will be caught by middleware and sent to /login.
 */
export default function Home() {
  redirect('/dashboard');
}
