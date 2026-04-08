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

function toEventEntry(event: any, tx: any) {
  return {
    id: event.id,
    contactId: event.contactId ?? '',
    eventType: event.eventType.toLowerCase(),
    type: tx?.type ?? 'EXPENSE',
    date: typeof event.date === 'string' ? event.date : event.date.toISOString().split('T')[0],
    location: event.location,
    targetName: event.targetName,
    account: tx?.account ?? event.account ?? '',
    amount: tx?.amount ?? 0,
    relation: event.relation,
    recommendationReason: tx?.recommendationReason ?? '',
    customEventName: event.customEventName ?? '',
    memo: event.memo,
    isIncome: (tx?.type ?? 'EXPENSE') === 'INCOME',
    createdAt: event.createdAt instanceof Date ? event.createdAt.getTime() : new Date(event.createdAt).getTime(),
    userId: event.userId,
  };
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const events = await prisma.event.findMany({
    where: { userId },
    include: { transactions: { take: 1, orderBy: { createdAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return withCors(req, NextResponse.json({ entries: events.map((e: any) => toEventEntry(e, e.transactions[0])) }));
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const body = await req.json();
  const result = await prisma.$transaction(async (tx: any) => {
    // 로그인 사용자: toss_user_id 쿠키 = DB user.id
    // 비로그인 게스트: x-user-id 헤더 = device ID
    let realUserId = userId;
    const authHeader = req.headers.get('authorization');
    const isLoggedIn = !!(authHeader?.startsWith('Bearer ') && verifyJwt(authHeader.slice(7))) || !!req.cookies.get('toss_user_id')?.value;
    if (!isLoggedIn) {
      // 비로그인 게스트만 upsert 필요
      const user = await tx.user.upsert({
        where: { tossUserKey: userId },
        update: {},
        create: { tossUserKey: userId },
        select: { id: true },
      });
      realUserId = user.id;
    }
    let contactId = body.contactId || null;
    if (!contactId && body.targetName) {
      const existing = await tx.contact.findFirst({ where: { userId: realUserId, name: body.targetName } });
      contactId = existing ? existing.id : (await tx.contact.create({ data: { userId: realUserId, name: body.targetName, relation: body.relation || '지인' } })).id;
    }
    const event = await tx.event.create({ data: { userId: realUserId, contactId, eventType: body.eventType.toUpperCase(), targetName: body.targetName, date: new Date(body.date), location: body.location ?? '', relation: body.relation ?? '', memo: body.memo ?? '', account: body.account ?? '', customEventName: body.customEventName ?? null } });
    const transaction = await tx.transaction.create({ data: { eventId: event.id, userId: realUserId, type: body.type ?? 'EXPENSE', amount: Number(body.amount) || 0, account: body.account ?? '', relation: body.relation ?? '', recommendationReason: body.recommendationReason ?? '' } });
    // 생성/조회된 contact 정보 반환 (클라이언트 store 동기화용)
    let contact = null;
    if (contactId) {
      contact = await tx.contact.findUnique({ where: { id: contactId } });
    }
    return { event, transaction, contact };
  });
  return withCors(req, NextResponse.json({
    entry: toEventEntry(result.event, result.transaction),
    contact: result.contact ? {
      id: result.contact.id,
      name: result.contact.name,
      phone: result.contact.phone ?? '',
      relation: result.contact.relation ?? '',
      userId: result.contact.userId,
    } : null,
  }));
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return withCors(req, NextResponse.json({ error: 'Missing id' }, { status: 400 }));
  await prisma.event.deleteMany({ where: { id, userId } });
  return withCors(req, NextResponse.json({ ok: true }));
}

export async function PATCH(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return withCors(req, NextResponse.json({ error: 'Missing id' }, { status: 400 }));
  const body = await req.json();
  const ev: any = {};
  if (body.date) ev.date = new Date(body.date);
  if (body.location !== undefined) ev.location = body.location;
  if (body.eventType) ev.eventType = body.eventType.toUpperCase();
  if (body.memo !== undefined) ev.memo = body.memo;
  if (body.relation !== undefined) ev.relation = body.relation;
  const tv: any = {};
  if (body.amount !== undefined) tv.amount = Number(body.amount);
  if (body.type) tv.type = body.type;
  await prisma.$transaction(async (tx: any) => {
    if (Object.keys(ev).length) await tx.event.updateMany({ where: { id, userId }, data: ev });
    if (Object.keys(tv).length) await tx.transaction.updateMany({ where: { eventId: id, userId }, data: tv });
  });
  return withCors(req, NextResponse.json({ ok: true }));
}
