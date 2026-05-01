/**
 * LLM inference wrapper for price suggestions.
 *
 * Uses OpenAI's chat completions API. The wrapper is intentionally narrow:
 * one function, one response shape — easy to swap providers later by giving
 * this file a sibling and switching the import in the API route.
 *
 * Design notes:
 * - JSON mode (`response_format: 'json_object'`) is enabled so we don't have
 *   to parse free text. The system prompt still tells the model the field
 *   names and types so it complies even if JSON mode loosens.
 * - Prompt caching is automatic on GPT-5-class models for prompts > ~1024
 *   tokens. The system prompt below is comfortably above that floor; the
 *   cache hit count comes back via `usage.prompt_tokens_details.cached_tokens`.
 * - Token usage is reported back to the caller so it can be persisted per
 *   suggestion. Without this, cost auditing is guesswork.
 */

import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-5.4-mini';

const SYSTEM_PROMPT = `You are a hotel-pricing analyst working inside a revenue-management product.

Your job is to suggest a fair, defensible nightly rate for a single room on a single date, given a small set of inputs. Hotels lose money in two directions: by pricing too low (leaving margin on the table) and by pricing too high (driving customers away or creating a refund/dispute risk). Your suggestions should always sit inside the safe zone for the given inputs.

You will be given a JSON object with these fields:
- basePrice: the floor / reference rate for this room, in USD
- currentPrice: the most recent active rate
- date: the night being priced, in YYYY-MM-DD format
- occupancy: a number 0.0 to 1.0 (0 = empty, 1 = sold out)
- contextNote: optional free-text context (events, season, anomalies)

You return a single JSON object with exactly two fields and nothing else:
{
  "suggestedPrice": <number, USD, no currency symbol, two decimals>,
  "reasoning": "<one short paragraph (1-3 sentences) explaining the call>"
}

Pricing principles you follow strictly:
1. Higher occupancy → higher price. Lower occupancy → discount cautiously to preserve perceived value.
2. Never price below 70% of base. The price floor protects the brand.
3. Never price above 250% of base in a single move. Big jumps damage trust and trigger booking-platform anomaly flags.
4. Weekend nights (Friday + Saturday) price ~15-25% above the equivalent weekday at the same occupancy.
5. Local events / context notes can justify exceeding the normal occupancy curve, but stay inside the 250%-of-base ceiling.
6. Be conservative when occupancy data is sparse, contradictory, or missing — bias toward currentPrice.
7. Prefer round-ish prices that look intentional ($199 over $198.50) when the math allows it.

Always output valid JSON. Always two decimals on suggestedPrice. Never include any text outside the JSON object.`;

export interface PriceCallInput {
  basePrice: number;
  currentPrice: number;
  date: string;
  occupancy: number;
  contextNote?: string;
}

export interface PriceCallOutput {
  suggestedPrice: number;
  reasoning: string;
  modelUsed: string;
  cacheHit: boolean;
  tokensIn: number;
  tokensOut: number;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Copy .env.example to .env and set it.'
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function suggestPrice(
  input: PriceCallInput
): Promise<PriceCallOutput> {
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const userPayload = JSON.stringify(input);

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPayload },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 400,
  });

  const choice = response.choices[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new Error('OpenAI returned no content');
  }

  let parsed: { suggestedPrice: number; reasoning: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `OpenAI returned malformed JSON. Raw output: ${text.slice(0, 200)}`
    );
  }

  if (
    typeof parsed.suggestedPrice !== 'number' ||
    typeof parsed.reasoning !== 'string'
  ) {
    throw new Error('OpenAI response missing required fields');
  }

  const usage = response.usage;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    suggestedPrice: parsed.suggestedPrice,
    reasoning: parsed.reasoning,
    modelUsed: response.model,
    cacheHit: cachedTokens > 0,
    tokensIn: usage?.prompt_tokens ?? 0,
    tokensOut: usage?.completion_tokens ?? 0,
  };
}
