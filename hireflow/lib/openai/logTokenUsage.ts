/**
 * Token usage logger — uses Drizzle ORM.
 * Tracks LLM token consumption per user per call type.
 */

import { getDb } from '@/lib/db';
import { tokenUsageLogs } from '@/lib/db/schema';

export async function logTokenUsage({
  userId,
  callType,
  tokensUsed,
}: {
  userId: string;
  callType: 'resume_scoring' | 'email_drafting' | 'feedback_summary';
  tokensUsed: number;
}) {
  try {
    const db = getDb();
    await db.insert(tokenUsageLogs).values({
      userId,
      callType,
      tokensUsed,
    });
  } catch (err) {
    console.error('[token-usage] Failed to log usage:', err);
  }
}
