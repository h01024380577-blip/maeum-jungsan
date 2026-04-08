import { cookies, headers } from 'next/headers';
import { verifyJwt } from '@/src/lib/jwt';

/**
 * 현재 요청의 인증된 사용자 ID 반환
 * 1순위: Bearer 토큰 (CSR 모드)
 * 2순위: 쿠키 (SSR 하위호환)
 * 미인증이면 null
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  // 1순위: Bearer 토큰
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = verifyJwt(authHeader.slice(7));
    if (jwt) return jwt.userId;
  }

  // 2순위: 쿠키 (하위호환)
  const cookieStore = await cookies();
  return cookieStore.get('toss_user_id')?.value ?? null;
}
