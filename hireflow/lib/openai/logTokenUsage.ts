import type { SupabaseClient } from '@supabase/supabase-js';
import type { LLMCallType } from '@/lib/types';

/**
 * Log token usage after every OpenAI call.
 * Tagged exactly: 'resume_scoring' | 'email_drafting' | 'feedback_summary'
 * per Rule 11 in the agent prompt.
 */
export async function logTokenUsage({
  supabase,
  userId,
  callType,
  tokensUsed,
}: {
  supabase: SupabaseClient;
  userId: string;
  callType: LLMCallType;
  tokensUsed: number;
}): Promise<void> {
  const { error } = await supabase.from('token_usage_logs').insert({
    user_id: userId,
    call_type: callType,
    tokens_used: tokensUsed,
  });

  if (error) {
    // Log but don't throw — token logging should never break the primary operation
    console.error('[token_usage] Failed to log token usage:', error.message, {
      userId,
      callType,
      tokensUsed,
    });
  }
}
