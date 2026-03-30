import { describe, it, expect, vi } from 'vitest';

// next-auth mock
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('./auth', () => ({
  authOptions: {},
}));

import { getServerSession } from 'next-auth';
import { getAuthenticatedUserId } from './apiAuth';

const mockGetServerSession = getServerSession as any;

describe('getAuthenticatedUserId', () => {
  it('세션이 있으면 userId를 반환한다', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user-abc-123', name: '허지원' },
    });

    const userId = await getAuthenticatedUserId();
    expect(userId).toBe('user-abc-123');
  });

  it('세션이 없으면 null을 반환한다', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const userId = await getAuthenticatedUserId();
    expect(userId).toBeNull();
  });

  it('세션에 user가 없으면 null을 반환한다', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: null });

    const userId = await getAuthenticatedUserId();
    expect(userId).toBeNull();
  });

  it('세션에 user.id가 없으면 null을 반환한다', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: '허지원' },
    });

    const userId = await getAuthenticatedUserId();
    expect(userId).toBeNull();
  });
});
