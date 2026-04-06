import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

function getUserId(req: NextRequest): string | null {
  const cookie = req.cookies.get('toss_user_id')?.value;
  if (cookie) return cookie;
  return req.headers.get('x-user-id') ?? null;
}

function toContact(row: any) {
  return { id: row.id, name: row.name, phone: row.phone ?? '', kakaoId: row.kakaoId ?? '', relation: row.relation ?? '', avatar: row.avatar ?? '', userId: row.userId };
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const contacts = await prisma.contact.findMany({ where: { userId } });
  return NextResponse.json({ contacts: contacts.map(toContact) });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  // 로그인 사용자: userId = DB user.id, 비로그인: userId = device ID
  let realUserId = userId;
  const isLoggedIn = !!req.cookies.get('toss_user_id')?.value;
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
  return NextResponse.json({ contact: toContact(contact), id: contact.id });
}

export async function PATCH(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const body = await req.json();
  const updates: any = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.relation !== undefined) updates.relation = body.relation;
  await prisma.contact.updateMany({ where: { id, userId }, data: updates });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await prisma.contact.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
