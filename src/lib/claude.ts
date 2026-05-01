/**
 * Claude inference wrapper for price suggestions.
 *
 * Design notes:
 * - System prompt is wrapped in cache_control so the second-and-onward calls
 *   are cheap (~10x cost reduction in practice). The system prompt rarely
 *   changes; the per-request payload is small.
 * - Output is structured JSON via a strict response shape. We parse and
 *   validate before returning. If Claude returns malformed JSON we surface
 *   that as an error rather than silently fall back.
 * - We log token usage for every call so we can audit cost / cache-hit ratio.
 *   This becomes the input to the price-suggestions-per-dollar metric.
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a hotel-pricing analyst.

You are given:
- Room base price (the floor / reference)
- Current price (the most recent set rate)
- Date being priced
- Occupancy signal (0.0 = empty, 1.0 = sold out)
- Optional context note (event, season, anomaly)

You return a JSON object with exactly two fields:
{
  "suggestedPrice": <number, USD, no currency symbol>,
  "reasoning": "<one short paragraph explaining the call>"
}

Pricing principles you follow:
1. Higher occupancy → higher price. Lower occupancy → discount cautiously to preserve perceived value.
2. Never price below 70% of base. The price floor protects the brand.
3. Never price above 250% of base in a single move. Big jumps damage trust.
4. Weekend nights price ~15-25% above weekday at equivalent occupancy.
5. Local events / context notes can justify exceeding the normal occupancy curve.
6. Be conservative when occupancy data is sparse or contradictory.

Output ONLY the JSON object. No prose before or after. No markdown fences.`;

export interface ClaudePriceCallInput {
  basePrice: number;
  currentPrice: number;
  date: string;
  occupancy: number;
  contextNote?: string;
}

export interface ClaudePriceCallOutput {
  suggestedPrice: number;
  reasoning: string;
  modelUsed: string;
  cacheHit: boolean;
  tokensIn: number;
  tokensOut: number;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and set it.'
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function suggestPrice(
  input: ClaudePriceCallInput
): Promise<ClaudePriceCallOutput> {
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const userPayload = JSON.stringify(input);

  const response = await getClient().messages.create({
    model,
    max_tokens: 400,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPayload }],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content');
  }

  let parsed: { suggestedPrice: number; reasoning: string };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error(
      `Claude returned malformed JSON. Raw output: ${textBlock.text.slice(0, 200)}`
    );
  }

  if (
    typeof parsed.suggestedPrice !== 'number' ||
    typeof parsed.reasoning !== 'string'
  ) {
    throw new Error('Claude response missing required fields');
  }

  const usage = response.usage;
  const cacheHit =
    (usage.cache_read_input_tokens ?? 0) > 0;

  return {
    suggestedPrice: parsed.suggestedPrice,
    reasoning: parsed.reasoning,
    modelUsed: response.model,
    cacheHit,
    tokensIn: usage.input_tokens + (usage.cache_read_input_tokens ?? 0),
    tokensOut: usage.output_tokens,
  };
}
