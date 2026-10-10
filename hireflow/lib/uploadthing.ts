/**
 * Uploadthing file router — handles resume uploads.
 *
 * Replaces Supabase Storage. Resumes are uploaded via the dashboard
 * or webhook and stored on Uploadthing's CDN.
 */

import { createUploadthing, type FileRouter } from 'uploadthing/server';

const f = createUploadthing();

export const uploadRouter = {
  resumeUploader: f({
    pdf: { maxFileSize: '8MB', maxFileCount: 1 },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      maxFileSize: '8MB',
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      // For webhook uploads (n8n), no auth required
      // For dashboard uploads, Clerk auth is enforced at the page level
      return {};
    })
    .onUploadComplete(async ({ file }) => {
      console.log('[uploadthing] Resume uploaded:', file.ufsUrl);
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
