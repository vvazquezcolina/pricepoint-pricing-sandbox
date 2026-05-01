/**
 * POST /api/suggest-price — ask the LLM for a price suggestion for one
 * room+date combination.
 *
 * Boundary validation: SuggestPriceInputSchema (zod).
 * Rate limit: 5 requests per IP per hour (in-memory, see lib/rate-limit.ts).
 * Failure modes:
 * - Rate limit exceeded → 429
 * - Demo mode (no API key) → 503
 * - Malformed input → 400
 * - Room not found → 404
 * - AI inference fails → 502
 * Side effects: persists the suggestion + token usage to PriceSuggestion.
 *
 * Note on writes in production: when deployed on Vercel with a read-only
 * SQLite bundle staged to /tmp, writes succeed (since /tmp is writable) but
 * don't persist across cold starts. Acceptable for the demo. Real production
 * uses Postgres — same Prisma code, different `provider` in schema.prisma.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { suggestPrice as callLLM } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  SuggestPriceInputSchema,
  type SuggestPriceOutput,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        detail: `Try again after ${new Date(limit.resetAt).toISOString()}. Limit is 5 suggestions per IP per hour to keep the demo cheap.`,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(limit.resetAt / 1000)),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    );
  }

  const parsed = SuggestPriceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { roomId, date, occupancyHint, contextNote } = parsed.data;

  // Demo-mode guard: when no API key is set (e.g. someone forks the repo
  // without configuring it), short-circuit before any expensive work.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        mode: 'demo',
        error: 'Demo mode — this deployment runs without an API key',
        detail:
          'To see real AI price suggestions, set OPENAI_API_KEY (locally or as a Vercel env var):\n\ngithub.com/vvazquezcolina/pricepoint-pricing-sandbox',
      },
      { status: 503 }
    );
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Pull recent occupancy signal for the date if no hint provided
  let occupancy = occupancyHint;
  if (occupancy === undefined) {
    const targetDate = new Date(date);
    const event = await prisma.occupancyEvent.findFirst({
      where: { roomId, date: targetDate },
      orderBy: { date: 'desc' },
    });
    occupancy = event?.occupancy ?? 0.5;
  }

  let aiResult;
  try {
    aiResult = await callLLM({
      basePrice: room.basePrice,
      currentPrice: room.currentPrice,
      date,
      occupancy,
      contextNote,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    return NextResponse.json(
      { error: 'AI inference failed', detail: message },
      { status: 502 }
    );
  }

  let savedId: string | null = null;
  try {
    const saved = await prisma.priceSuggestion.create({
      data: {
        roomId,
        date: new Date(date),
        suggestedPrice: aiResult.suggestedPrice,
        reasoning: aiResult.reasoning,
        inputs: JSON.stringify({
          basePrice: room.basePrice,
          currentPrice: room.currentPrice,
          occupancy,
          contextNote: contextNote ?? null,
        }),
        modelUsed: aiResult.modelUsed,
        promptCacheHit: aiResult.cacheHit,
        tokensIn: aiResult.tokensIn,
        tokensOut: aiResult.tokensOut,
      },
    });
    savedId = saved.id;
  } catch (err) {
    // Read-only SQLite (or other DB unreachable) shouldn't block returning
    // the suggestion. Log and proceed.
    console.error('Failed to persist suggestion:', err);
  }

  const response: SuggestPriceOutput = {
    suggestionId: savedId ?? 'unsaved',
    roomId,
    date,
    suggestedPrice: aiResult.suggestedPrice,
    reasoning: aiResult.reasoning,
    modelUsed: aiResult.modelUsed,
    cacheHit: aiResult.cacheHit,
    tokensIn: aiResult.tokensIn,
    tokensOut: aiResult.tokensOut,
  };

  return NextResponse.json(response, {
    headers: {
      'X-RateLimit-Remaining': String(limit.remaining),
      'X-RateLimit-Reset': String(Math.floor(limit.resetAt / 1000)),
    },
  });
}
