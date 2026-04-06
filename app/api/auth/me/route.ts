import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';

async function refreshAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { refreshToken: true } });
  if (!user?.refreshToken) return null;

  const res = await fetch(
    `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/refresh-token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: user.refreshToken }),
    }
  );
  const data = await res.json();
  if (!data.success?.accessToken) return null;

  const { accessToken, refreshToken, expiresIn } = data.success;
  const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken,
      refreshToken: refreshToken || undefined,
      tokenExpiresAt,
    },
  });
  return accessToken;
}

export async function GET(req: NextRequest) {
  const userId = req.cookies.get('toss_user_id')?.value;
  if (!userId) return NextResponse.json({ userId: null }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tossUserKey: true, name: true, accessToken: true, tokenExpiresAt: true },
  });
  if (!user) return NextResponse.json({ userId: null }, { status: 401 });

  // 토큰 만료 확인 및 자동 갱신
  let validToken = user.accessToken;
  if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
    validToken = await refreshAccessToken(userId);
  }

  return NextResponse.json({
    userId: user.id,
    userKey: user.tossUserKey,
    name: user.name,
    isTokenValid: !!validToken,
  });
}
