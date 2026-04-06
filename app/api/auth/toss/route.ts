import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv } from 'crypto';
import { prisma } from '@/src/lib/prisma';

const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';

function decrypt(encryptedText: string): string {
  const IV_LENGTH = 12;
  const key = Buffer.from(process.env.TOSS_DECRYPT_KEY!, 'base64');
  const aad = process.env.TOSS_DECRYPT_AAD!;
  const decoded = Buffer.from(encryptedText, 'base64');
  const iv = decoded.subarray(0, IV_LENGTH);
  const tag = decoded.subarray(decoded.length - 16);
  const ciphertext = decoded.subarray(IV_LENGTH, decoded.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from(aad));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export async function POST(req: NextRequest) {
  const { authorizationCode, referrer } = await req.json();
  if (!authorizationCode) {
    return NextResponse.json({ error: 'Missing authorizationCode' }, { status: 400 });
  }

  // Step 2: 토큰 발급
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
  const { accessToken } = tokenData.success;

  // Step 3: 사용자 정보 조회
  const userRes = await fetch(
    `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const userData = await userRes.json();
  if (!userData.success?.userKey) {
    return NextResponse.json({ error: '사용자 조회 실패' }, { status: 401 });
  }

  const { userKey } = userData.success;

  // Prisma: upsert User (tossUserKey 기준)
  const user = await prisma.user.upsert({
    where: { tossUserKey: String(userKey) },
    update: { updatedAt: new Date() },
    create: { tossUserKey: String(userKey) },
    select: { id: true },
  });

  const res = NextResponse.json({ ok: true, userId: user.id });
  // DB userId (내부 식별용)
  res.cookies.set('toss_user_id', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14,
  });
  // 토스 원본 userKey (토스페이 API x-toss-user-key 헤더용)
  res.cookies.set('toss_user_key', String(userKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
