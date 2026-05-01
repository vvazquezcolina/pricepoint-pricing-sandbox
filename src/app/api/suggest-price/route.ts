/**
 * POST /api/suggest-price — ask the AI for a price suggestion for one
 * room+date combination.
 *
 * Boundary validation: SuggestPriceInputSchema (zod).
 * Failure modes:
 * - Room not found → 404
 * - AI inference fails → 502
 * - Malformed input → 400
 * Side effects: persists the suggestion + token usage to PriceSuggestion.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { suggestPrice as callClaude } from '@/lib/claude';
import {
  SuggestPriceInputSchema,
  type SuggestPriceOutput,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
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

  // Demo-mode guard: the deployed sandbox runs without an API key on purpose.
  // Anyone can hit this endpoint; without the guard, abuse would burn tokens.
  // Local clones with a real key skip this branch and get real AI suggestions.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        mode: 'demo',
        error: 'Demo mode — this deployed sandbox runs without an API key',
        detail:
          'To see real AI price suggestions, clone the repo and run locally with your own ANTHROPIC_API_KEY:\n\ngithub.com/vvazquezcolina/pricepoint-pricing-sandbox',
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
    aiResult = await callClaude({
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

  const response: SuggestPriceOutput = {
    suggestionId: saved.id,
    roomId,
    date,
    suggestedPrice: aiResult.suggestedPrice,
    reasoning: aiResult.reasoning,
    modelUsed: aiResult.modelUsed,
    cacheHit: aiResult.cacheHit,
    tokensIn: aiResult.tokensIn,
    tokensOut: aiResult.tokensOut,
  };

  return NextResponse.json(response);
}
