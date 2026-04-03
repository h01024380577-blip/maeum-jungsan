import { cookies } from 'next/headers';

/**
 * 현재 요청의 인증된 사용자 ID 반환 (토스 로그인 쿠키 기반)
 * 미인증이면 null
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('toss_user_id')?.value ?? null;
}
