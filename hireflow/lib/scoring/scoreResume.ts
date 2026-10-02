/**
 * Call 1: Structured resume scoring against a job's explicit criteria.
 * 
 * The LLM scores the resume against EACH criterion individually.
 * Returns structured JSON with per-criterion evidence — not a single opaque number.
 * The recommendation is a SUGGESTION for a human reviewer, never a decision.
 * 
 * Per Rule 2: This function never triggers any candidate-facing action.
 * Per Rule 3: Always returns full structured output with evidence per criterion.
 * Per Rule 8: This is exactly 1 of the 3 allowed LLM calls.
 * Per Rule 9: Raw OpenAI API, no LangChain.
 */

import { getOpenAIClient, HIREFLOW_MODEL } from '@/lib/openai/client';
import type { JobCriterion, CriterionResult, ScoringRecommendation } from '@/lib/types';

export interface ScoringResult {
  criteria_results: CriterionResult[];
  overall_score: number;
  recommendation: ScoringRecommendation;
  tokensUsed: number;
}

const SCORING_SYSTEM_PROMPT = `You are scoring a candidate's resume against explicit job criteria. You do not make hiring decisions — you assess evidence.
For each criterion listed below, determine whether the resume provides evidence it is met. Return JSON only:
{ "criteria_results": [ { "criterion": string, "met": boolean, "evidence": string } ], "overall_score": number (0-100), "recommendation": "advance" | "reject" | "unclear" }
"evidence" must quote or closely paraphrase the specific part of the resume that supports your judgment, or state "No evidence found" if the criterion isn't addressed. Do not infer qualifications beyond what the resume states. "recommendation" is a suggestion for a human reviewer, not a decision.`;

/**
 * Score a resume against job criteria using the LLM.
 * Returns fully structured per-criterion results with evidence.
 */
export async function scoreResume({
  criteria,
  resumeText,
}: {
  criteria: JobCriterion[];
  resumeText: string;
}): Promise<ScoringResult> {
  const openai = getOpenAIClient();

  const criteriaText = criteria
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} (weight: ${c.weight}): ${c.description}`
    )
    .join('\n');

  const userMessage = `Criteria:\n${criteriaText}\n\nResume:\n${resumeText}`;

  const response = await openai.chat.completions.create({
    model: HIREFLOW_MODEL,
    messages: [
      { role: 'system', content: SCORING_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1, // Low temperature for consistent, factual scoring
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response for resume scoring.');
  }

  const tokensUsed = response.usage?.total_tokens ?? 0;

  // Parse and validate the structured response
  const parsed = JSON.parse(content) as {
    criteria_results?: CriterionResult[];
    overall_score?: number;
    recommendation?: string;
  };

  // Validate required fields
  if (
    !parsed.criteria_results ||
    !Array.isArray(parsed.criteria_results) ||
    parsed.criteria_results.length === 0
  ) {
    throw new Error(
      'LLM scoring response missing or empty criteria_results array.'
    );
  }

  if (typeof parsed.overall_score !== 'number') {
    throw new Error('LLM scoring response missing overall_score.');
  }

  const validRecommendations: ScoringRecommendation[] = [
    'advance',
    'reject',
    'unclear',
  ];
  const recommendation = validRecommendations.includes(
    parsed.recommendation as ScoringRecommendation
  )
    ? (parsed.recommendation as ScoringRecommendation)
    : 'unclear';

  // Ensure every criterion result has the required fields
  const criteriaResults: CriterionResult[] = parsed.criteria_results.map(
    (cr) => ({
      criterion: String(cr.criterion || 'Unknown criterion'),
      met: Boolean(cr.met),
      evidence: String(cr.evidence || 'No evidence provided'),
    })
  );

  return {
    criteria_results: criteriaResults,
    overall_score: Math.max(0, Math.min(100, parsed.overall_score)),
    recommendation,
    tokensUsed,
  };
}
