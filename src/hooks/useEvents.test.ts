import { describe, it, expect } from 'vitest';
import { swrFetcher } from './useEvents';

describe('swrFetcher', () => {
  it('정상 응답 시 JSON을 반환한다', async () => {
    global.fetch = (() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ events: [{ id: '1' }] }),
      })) as any;

    const result = await swrFetcher('/api/events');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe('1');
  });

  it('에러 응답 시 throw한다', async () => {
    global.fetch = (() =>
      Promise.resolve({
        ok: false,
        status: 401,
      })) as any;

    await expect(swrFetcher('/api/events')).rejects.toThrow();
  });
});
