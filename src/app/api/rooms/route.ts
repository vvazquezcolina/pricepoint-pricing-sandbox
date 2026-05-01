/**
 * GET /api/rooms — list rooms with their current price and base price.
 *
 * Boundary validation: none required (no input).
 * Caching: server response is fresh per request — rooms can be edited.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { RoomSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rooms = await prisma.room.findMany({
    orderBy: { basePrice: 'asc' },
  });

  const summaries: RoomSummary[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    basePrice: r.basePrice,
    currentPrice: r.currentPrice,
    capacity: r.capacity,
    description: r.description,
  }));

  return NextResponse.json({ rooms: summaries });
}
