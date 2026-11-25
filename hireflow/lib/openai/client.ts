import OpenAI from 'openai';

/**
 * Singleton LLM client (OpenAI-compatible).
 * Used for all three LLM calls: resume scoring, email drafting, feedback summary.
 *
 * Supports two providers via env vars:
 *   - GEMINI_API_KEY → Google Gemini (free tier, recommended)
 *   - OPENAI_API_KEY → OpenAI (requires billing)
 *
 * Both use the OpenAI SDK — Gemini exposes an OpenAI-compatible endpoint.
 */

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    // Prefer Gemini (free), fall back to OpenAI
    if (process.env.GEMINI_API_KEY) {
      client = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
    } else if (process.env.OPENAI_API_KEY) {
      client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    } else {
      throw new Error(
        'No LLM API key found. Set GEMINI_API_KEY (free) or OPENAI_API_KEY in your .env.local file.'
      );
    }
  }
  return client;
}

/** The model used for all HireFlow LLM calls */
export const HIREFLOW_MODEL = process.env.GEMINI_API_KEY
  ? 'gemini-2.0-flash'
  : 'gpt-4o-mini';
