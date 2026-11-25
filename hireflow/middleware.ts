import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Clerk auth middleware — replaces the old Supabase proxy.
 *
 * Public routes: login, signup, webhook endpoints, candidate-facing pages.
 * Everything else requires authentication.
 */

const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/signup(.*)',
  '/api/webhooks/(.*)',          // ATS webhook — no auth
  '/api/applications/(.*)',      // n8n calls extract, score, PATCH, interview-slots
  '/api/emails/draft',           // n8n calls this
  '/api/feedback/generate',      // n8n calls this
  '/api/interviews/(.*)',        // Candidate-facing + n8n reminder calls
  '/api/audit/(.*)',             // Audit trail — n8n and dashboard
  '/interviews/(.*)/confirm',    // Candidate-facing slot picker
  '/api/uploadthing(.*)',        // Uploadthing file upload handler
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Match all request paths except static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
