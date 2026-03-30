import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

/**
 * 현재 요청의 인증된 사용자 ID를 반환.
 * 미인증이면 null.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}
