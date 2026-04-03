import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

function getUserId(req: NextRequest): string | null {
  return req.cookies.get('toss_user_id')?.value ?? null;
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
  const contact = await prisma.contact.create({ data: { userId, name: body.name, phone: body.phone ?? '', kakaoId: body.kakaoId ?? null, relation: body.relation ?? '', avatar: body.avatar ?? null } });
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
