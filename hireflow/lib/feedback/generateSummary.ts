/**
 * Call 3: Post-interview feedback summary generation.
 *
 * Summarizes interview notes into a structured report for the hiring team.
 * Per Rule 8: This is the 3rd and final allowed LLM call.
 * Per spec section 9: Bases summary ONLY on provided notes — never invents details.
 */

import { getOpenAIClient, HIREFLOW_MODEL } from '@/lib/openai/client';

export interface FeedbackSummaryResult {
  summary_text: string;
  tokensUsed: number;
}

const FEEDBACK_SYSTEM_PROMPT = `Summarize this interview stage into a structured note for the hiring team: key strengths observed, concerns raised, and a recommendation for next steps. Base this only on the notes provided — do not invent details. Return JSON only: { "summary_text": string }`;

export async function generateFeedbackSummary({
  interviewNotes,
  candidateName,
  jobTitle,
}: {
  interviewNotes: string;
  candidateName: string;
  jobTitle: string;
}): Promise<FeedbackSummaryResult> {
  const openai = getOpenAIClient();

  const userMessage = `Candidate: ${candidateName}\nPosition: ${jobTitle}\n\nInterview notes:\n${interviewNotes}`;

  const response = await openai.chat.completions.create({
    model: HIREFLOW_MODEL,
    messages: [
      { role: 'system', content: FEEDBACK_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for feedback summary.');
  }

  const tokensUsed = response.usage?.total_tokens ?? 0;
  const parsed = JSON.parse(content) as { summary_text?: string };

  return {
    summary_text: parsed.summary_text ?? content,
    tokensUsed,
  };
}
