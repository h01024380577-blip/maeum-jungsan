import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';

export async function POST(req: NextRequest) {
  const userId = req.cookies.get('toss_user_id')?.value;
  const userKey = req.cookies.get('toss_user_key')?.value;

  // 토스 연결 끊기 (userKey가 있으면)
  if (userKey) {
    try {
      await fetch(
        `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userKey: Number(userKey) }),
        }
      );
    } catch {
      // 연결 끊기 실패해도 로그아웃은 진행
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
  return res;
}
