import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyJwt } from '@/src/lib/jwt';
import { corsResponse, withCors } from '@/src/lib/cors';

function getUserId(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = verifyJwt(authHeader.slice(7));
    if (jwt) return jwt.userId;
  }
  return req.cookies.get('toss_user_id')?.value ?? null;
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ enabled: false }));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsEnabled: true },
  });

  return withCors(req, NextResponse.json({ enabled: user?.notificationsEnabled ?? false }));
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
  }

  const { enabled } = await req.json();

  await prisma.user.update({
    where: { id: userId },
    data: { notificationsEnabled: !!enabled },
  });

  return withCors(req, NextResponse.json({ ok: true, enabled: !!enabled }));
}
