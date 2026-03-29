import { describe, it, expect, vi } from 'vitest';

vi.mock('./prisma', () => ({
  prisma: {},
}));

import { authOptions } from './auth';

describe('authOptions', () => {
  it('KakaoProvider가 설정되어 있다', () => {
    const kakao = authOptions.providers.find(
      (p: any) => p.id === 'kakao'
    );
    expect(kakao).toBeDefined();
  });

  it('session callback이 user.id를 주입한다', () => {
    const sessionCb = authOptions.callbacks?.session as any;
    expect(sessionCb).toBeDefined();

    const mockSession = { user: { name: '테스트', email: 'test@test.com' } } as any;
    const mockUser = { id: 'user-123' } as any;
    const result = sessionCb({ session: mockSession, user: mockUser });

    expect(result.user.id).toBe('user-123');
  });

  it('adapter가 설정되어 있다', () => {
    expect(authOptions.adapter).toBeDefined();
  });
});
