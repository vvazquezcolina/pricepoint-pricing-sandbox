import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Anthropic SDK before importing the module under test
vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create },
    })),
    __mockCreate: create,
  };
});

describe('suggestPrice (Claude wrapper)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns parsed price + reasoning on a well-formed response', async () => {
    const mod = await import('@anthropic-ai/sdk');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'claude-sonnet-4-6',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            suggestedPrice: 215.5,
            reasoning: 'High weekend occupancy, modest bump from base.',
          }),
        },
      ],
      usage: {
        input_tokens: 50,
        output_tokens: 30,
        cache_read_input_tokens: 0,
      },
    });

    const { suggestPrice } = await import('../../src/lib/claude');
    const result = await suggestPrice({
      basePrice: 180,
      currentPrice: 180,
      date: '2026-05-15',
      occupancy: 0.85,
    });

    expect(result.suggestedPrice).toBe(215.5);
    expect(result.reasoning).toContain('weekend');
    expect(result.modelUsed).toBe('claude-sonnet-4-6');
    expect(result.cacheHit).toBe(false);
  });

  it('reports a cache hit when cache_read_input_tokens > 0', async () => {
    const mod = await import('@anthropic-ai/sdk');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'claude-sonnet-4-6',
      content: [
        {
          type: 'text',
          text: JSON.stringify({ suggestedPrice: 200, reasoning: 'ok' }),
        },
      ],
      usage: {
        input_tokens: 5,
        output_tokens: 20,
        cache_read_input_tokens: 800,
      },
    });

    const { suggestPrice } = await import('../../src/lib/claude');
    const result = await suggestPrice({
      basePrice: 180,
      currentPrice: 180,
      date: '2026-05-15',
      occupancy: 0.5,
    });

    expect(result.cacheHit).toBe(true);
    expect(result.tokensIn).toBe(5 + 800);
  });

  it('throws on malformed JSON output', async () => {
    const mod = await import('@anthropic-ai/sdk');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text: 'sorry, not JSON' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const { suggestPrice } = await import('../../src/lib/claude');
    await expect(
      suggestPrice({
        basePrice: 180,
        currentPrice: 180,
        date: '2026-05-15',
        occupancy: 0.5,
      })
    ).rejects.toThrow(/malformed JSON/);
  });

  it('throws on missing fields in JSON output', async () => {
    const mod = await import('@anthropic-ai/sdk');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'claude-sonnet-4-6',
      content: [
        { type: 'text', text: JSON.stringify({ suggestedPrice: 200 }) },
      ],
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const { suggestPrice } = await import('../../src/lib/claude');
    await expect(
      suggestPrice({
        basePrice: 180,
        currentPrice: 180,
        date: '2026-05-15',
        occupancy: 0.5,
      })
    ).rejects.toThrow(/missing required fields/);
  });

  it('throws when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { suggestPrice } = await import('../../src/lib/claude');
    await expect(
      suggestPrice({
        basePrice: 180,
        currentPrice: 180,
        date: '2026-05-15',
        occupancy: 0.5,
      })
    ).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
  });
});
