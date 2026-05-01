import { describe, it, expect } from 'vitest';
import { SuggestPriceInputSchema } from '../../src/lib/types';

describe('SuggestPriceInputSchema', () => {
  it('accepts valid input with date in YYYY-MM-DD format', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: 'room_123',
      date: '2026-05-15',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid input with full ISO datetime', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: 'room_123',
      date: '2026-05-15T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional context note and occupancy hint', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: 'room_123',
      date: '2026-05-15',
      occupancyHint: 0.85,
      contextNote: 'F1 weekend',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty roomId', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: '',
      date: '2026-05-15',
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed date string', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: 'room_123',
      date: 'tomorrow',
    });
    expect(result.success).toBe(false);
  });

  it('rejects occupancy hint above 1.0', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: 'room_123',
      date: '2026-05-15',
      occupancyHint: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects occupancy hint below 0', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: 'room_123',
      date: '2026-05-15',
      occupancyHint: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects context note longer than 500 chars', () => {
    const result = SuggestPriceInputSchema.safeParse({
      roomId: 'room_123',
      date: '2026-05-15',
      contextNote: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
