import OpenAI from 'openai';

/**
 * Singleton OpenAI client.
 * Used for all three LLM calls: resume scoring, email drafting, feedback summary.
 * Model: gpt-4o-mini (cheap, fast, good at structured JSON output).
 */

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to your .env.local file.'
      );
    }
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

/** The model used for all HireFlow LLM calls */
export const HIREFLOW_MODEL = 'gpt-4o-mini';
