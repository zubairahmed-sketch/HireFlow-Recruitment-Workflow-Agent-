/**
 * Call 2: Email drafting — rejection or interview-invite email copy.
 *
 * Per Rule 2: This draft is ALWAYS reviewed by a human before sending.
 * The actual email send happens in n8n's email nodes — never here.
 * Per Rule 8: This is Call 2 of the 3 allowed LLM calls.
 */

import { getOpenAIClient, HIREFLOW_MODEL } from '@/lib/openai/client';

export type EmailDecisionType = 'approved' | 'rejected' | 'more_info';

export interface DraftEmailResult {
  subject: string;
  body: string;
  tokensUsed: number;
}

const EMAIL_SYSTEM_PROMPT = `Draft a {DECISION_TYPE} email to a job candidate, professional and warm in tone, 100–150 words. This draft will be reviewed by a human before sending — write it as a strong starting point, not a final send-ready message. Do not fabricate specific feedback not present in the provided context. Return JSON only: { "subject": string, "body": string }`;

const DECISION_LABELS: Record<EmailDecisionType, string> = {
  approved: 'interview invitation',
  rejected: 'rejection',
  more_info: 'request for additional information',
};

export async function draftEmail({
  decisionType,
  candidateName,
  jobTitle,
  notes,
}: {
  decisionType: EmailDecisionType;
  candidateName: string;
  jobTitle: string;
  notes?: string;
}): Promise<DraftEmailResult> {
  const openai = getOpenAIClient();

  const systemPrompt = EMAIL_SYSTEM_PROMPT.replace(
    '{DECISION_TYPE}',
    DECISION_LABELS[decisionType]
  );

  const userMessage = [
    `Candidate name: ${candidateName}`,
    `Job title: ${jobTitle}`,
    `Decision type: ${decisionType}`,
    notes ? `Recruiter notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: HIREFLOW_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response for email drafting.');
  }

  const tokensUsed = response.usage?.total_tokens ?? 0;
  const parsed = JSON.parse(content) as { subject?: string; body?: string };

  return {
    subject: parsed.subject ?? `Re: Your application for ${jobTitle}`,
    body: parsed.body ?? content,
    tokensUsed,
  };
}
