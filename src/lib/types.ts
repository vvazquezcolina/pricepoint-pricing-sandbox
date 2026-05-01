/**
 * Shared types and Zod schemas for the API surface.
 *
 * Validation lives at the API boundary; internal calls trust these shapes.
 */

import { z } from 'zod';

export const SuggestPriceInputSchema = z.object({
  roomId: z.string().min(1),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  occupancyHint: z.number().min(0).max(1).optional(),
  contextNote: z.string().max(500).optional(),
});

export type SuggestPriceInput = z.infer<typeof SuggestPriceInputSchema>;

export interface SuggestPriceOutput {
  suggestionId: string;
  roomId: string;
  date: string;
  suggestedPrice: number;
  reasoning: string;
  modelUsed: string;
  cacheHit: boolean;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface RoomSummary {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
  capacity: number;
  description: string | null;
}
