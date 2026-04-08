import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { verifyJwt } from '@/src/lib/jwt';
import { corsResponse, withCors } from '@/src/lib/cors';

function getUserId(req: NextRequest): string | null {
  // 1순위: Bearer 토큰
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = verifyJwt(authHeader.slice(7));
    if (jwt) return jwt.userId;
  }
  // 2순위: 쿠키 (하위호환)
  const cookie = req.cookies.get('toss_user_id')?.value;
  if (cookie) return cookie;
  // 3순위: x-user-id 헤더 (게스트)
  return req.headers.get('x-user-id') ?? null;
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

function toContact(row: any) {
  return { id: row.id, name: row.name, phone: row.phone ?? '', kakaoId: row.kakaoId ?? '', relation: row.relation ?? '', avatar: row.avatar ?? '', userId: row.userId };
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const contacts = await prisma.contact.findMany({ where: { userId } });
  return withCors(req, NextResponse.json({ contacts: contacts.map(toContact) }));
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const body = await req.json();
  let realUserId = userId;
  const authHeader = req.headers.get('authorization');
  const isLoggedIn = !!(authHeader?.startsWith('Bearer ') && verifyJwt(authHeader.slice(7))) || !!req.cookies.get('toss_user_id')?.value;
  if (!isLoggedIn) {
    const user = await prisma.user.upsert({
      where: { tossUserKey: userId },
      update: {},
      create: { tossUserKey: userId },
      select: { id: true },
    });
    realUserId = user.id;
  }
  const contact = await prisma.contact.create({ data: { userId: realUserId, name: body.name, phone: body.phone ?? '', kakaoId: body.kakaoId ?? null, relation: body.relation ?? '', avatar: body.avatar ?? null } });
  return withCors(req, NextResponse.json({ contact: toContact(contact), id: contact.id }));
}

export async function PATCH(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return withCors(req, NextResponse.json({ error: 'Missing id' }, { status: 400 }));
  const body = await req.json();
  const updates: any = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.relation !== undefined) updates.relation = body.relation;
  await prisma.contact.updateMany({ where: { id, userId }, data: updates });
  return withCors(req, NextResponse.json({ ok: true }));
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return withCors(req, NextResponse.json({ error: 'Missing id' }, { status: 400 }));
  await prisma.contact.deleteMany({ where: { id, userId } });
  return withCors(req, NextResponse.json({ ok: true }));
}
