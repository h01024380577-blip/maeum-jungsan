import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';

export async function POST(req: NextRequest) {
  const { authorizationCode, referrer } = await req.json();
  if (!authorizationCode) {
    return NextResponse.json({ error: 'Missing authorizationCode' }, { status: 400 });
  }

  // Step 1: 토큰 발급
  const tokenRes = await fetch(
    `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode, referrer }),
    }
  );
  const tokenData = await tokenRes.json();
  if (!tokenData.success?.accessToken) {
    return NextResponse.json({ error: 'Token 발급 실패', detail: tokenData }, { status: 401 });
  }
  const { accessToken, refreshToken, expiresIn } = tokenData.success;

  // Step 2: 사용자 정보 조회
  const userRes = await fetch(
    `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const userData = await userRes.json();
  if (!userData.success?.userKey) {
    return NextResponse.json({ error: '사용자 조회 실패' }, { status: 401 });
  }

  const { userKey, name } = userData.success;
  const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  // Step 3: DB upsert (토큰 저장)
  const user = await prisma.user.upsert({
    where: { tossUserKey: String(userKey) },
    update: {
      name: name || undefined,
      accessToken,
      refreshToken: refreshToken || undefined,
      tokenExpiresAt,
      updatedAt: new Date(),
    },
    create: {
      tossUserKey: String(userKey),
      name: name || null,
      accessToken,
      refreshToken: refreshToken || null,
      tokenExpiresAt,
    },
    select: { id: true },
  });

  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set('toss_user_id', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14,
  });
  res.cookies.set('toss_user_key', String(userKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
