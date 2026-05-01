import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the OpenAI SDK before importing the module under test
vi.mock('openai', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create } },
    })),
    __mockCreate: create,
  };
});

describe('suggestPrice (OpenAI wrapper)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('returns parsed price + reasoning on a well-formed response', async () => {
    const mod = await import('openai');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'gpt-5.4-mini',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              suggestedPrice: 215.5,
              reasoning: 'High weekend occupancy, modest bump from base.',
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 1100,
        completion_tokens: 30,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    const { suggestPrice } = await import('../../src/lib/llm');
    const result = await suggestPrice({
      basePrice: 180,
      currentPrice: 180,
      date: '2026-05-15',
      occupancy: 0.85,
    });

    expect(result.suggestedPrice).toBe(215.5);
    expect(result.reasoning).toContain('weekend');
    expect(result.modelUsed).toBe('gpt-5.4-mini');
    expect(result.cacheHit).toBe(false);
    expect(result.tokensIn).toBe(1100);
    expect(result.tokensOut).toBe(30);
  });

  it('reports a cache hit when prompt_tokens_details.cached_tokens > 0', async () => {
    const mod = await import('openai');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'gpt-5.4-mini',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({ suggestedPrice: 200, reasoning: 'ok' }),
          },
        },
      ],
      usage: {
        prompt_tokens: 1100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 1000 },
      },
    });

    const { suggestPrice } = await import('../../src/lib/llm');
    const result = await suggestPrice({
      basePrice: 180,
      currentPrice: 180,
      date: '2026-05-15',
      occupancy: 0.5,
    });

    expect(result.cacheHit).toBe(true);
  });

  it('throws on malformed JSON output', async () => {
    const mod = await import('openai');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'gpt-5.4-mini',
      choices: [{ message: { role: 'assistant', content: 'sorry, not JSON' } }],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    const { suggestPrice } = await import('../../src/lib/llm');
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
    const mod = await import('openai');
    // @ts-expect-error - test-only mock handle
    const mockCreate = mod.__mockCreate;
    mockCreate.mockResolvedValueOnce({
      model: 'gpt-5.4-mini',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({ suggestedPrice: 200 }),
          },
        },
      ],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    });

    const { suggestPrice } = await import('../../src/lib/llm');
    await expect(
      suggestPrice({
        basePrice: 180,
        currentPrice: 180,
        date: '2026-05-15',
        occupancy: 0.5,
      })
    ).rejects.toThrow(/missing required fields/);
  });

  it('throws when OPENAI_API_KEY is unset', async () => {
    delete process.env.OPENAI_API_KEY;
    const { suggestPrice } = await import('../../src/lib/llm');
    await expect(
      suggestPrice({
        basePrice: 180,
        currentPrice: 180,
        date: '2026-05-15',
        occupancy: 0.5,
      })
    ).rejects.toThrow(/OPENAI_API_KEY is not set/);
  });
});
