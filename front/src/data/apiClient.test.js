import { describe, expect, it, vi } from 'vitest';
import { fetchJson } from './apiClient';

describe('fetchJson', () => {
  it('passes an optional AbortSignal to the fetch implementation', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ value: 'ok' }),
    });

    await expect(
      fetchJson('/data.json', { fetchImpl, signal: controller.signal }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      data: { value: 'ok' },
      error: null,
    });
    expect(fetchImpl).toHaveBeenCalledWith('/data.json', { signal: controller.signal });
  });
});
