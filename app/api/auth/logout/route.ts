import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { fetchWithRetry, TOSS_API_BASE } from '@/src/lib/tossApiClient';
import { verifyJwt } from '@/src/lib/jwt';
import { corsResponse, withCors } from '@/src/lib/cors';

export async function POST(req: NextRequest) {
  let userId = req.cookies.get('toss_user_id')?.value;
  let userKey = req.cookies.get('toss_user_key')?.value;

  // Bearer 토큰에서도 userId/userKey 추출 (CSR 모드)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = verifyJwt(authHeader.slice(7));
    if (jwt) {
      userId = jwt.userId;
      userKey = jwt.userKey;
    }
  }

  // 토스 연결 끊기 (remove-by-user-key)
  if (userKey) {
    try {
      await fetchWithRetry(
        `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userKey: Number(userKey) }),
          retries: 1,
        } as any
      );
    } catch {
      // 연결 끊기 실패해도 로컬 세션은 정리
    }
  }

  // DB 토큰 삭제
  if (userId) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { accessToken: null, refreshToken: null, tokenExpiresAt: null },
      });
    } catch {}
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete('toss_user_id');
  res.cookies.delete('toss_user_key');
  return withCors(req, res);
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}
