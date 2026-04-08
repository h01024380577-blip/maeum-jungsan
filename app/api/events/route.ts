import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { resolveUiTheme, validateCreateEventInput } from '@/src/lib/events';
import { getAuthenticatedUserId } from '@/src/lib/apiAuth';
import { corsResponse, withCors } from '@/src/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return withCors(request, NextResponse.json(
        { success: false, message: '로그인이 필요합니다.' },
        { status: 401 },
      ));
    }

    const body = await request.json();
    const validation = validateCreateEventInput(body);
    if (!validation.valid) {
      return withCors(request, NextResponse.json(
        { success: false, message: validation.message },
        { status: 400 },
      ));
    }

    const uiTheme = resolveUiTheme(body.eventType);

    const result = await prisma.$transaction(async (tx: any) => {
      const event = await tx.event.create({
        data: {
          userId,
          eventType: body.eventType,
          targetName: body.targetName.trim(),
          date: new Date(body.date),
          location: body.location || '',
          relation: body.relation || '',
          sourceUrl: body.sourceUrl || null,
          memo: body.memo || '',
          customEventName: body.customEventName || null,
          uiTheme,
          confidence: body.confidence || 'MEDIUM',
        },
      });

      let transaction = null;
      if (body.transaction && body.transaction.amount) {
        transaction = await tx.transaction.create({
          data: {
            eventId: event.id,
            userId,
            type: body.transaction.type || 'EXPENSE',
            amount: Math.round(Number(body.transaction.amount)),
            account: body.transaction.account || '',
          },
        });
      }

      return { event, transaction };
    });

    return withCors(request, NextResponse.json({
      success: true,
      event: {
        id: result.event.id,
        eventType: result.event.eventType,
        targetName: result.event.targetName,
        date: result.event.date.toISOString(),
        location: result.event.location,
        uiTheme: result.event.uiTheme,
      },
      transaction: result.transaction
        ? { id: result.transaction.id, amount: result.transaction.amount, type: result.transaction.type }
        : null,
    }));
  } catch (err: any) {
    console.error('[events] POST error:', err?.message);
    return withCors(request, NextResponse.json(
      { success: false, message: '저장에 실패했습니다.' },
      { status: 500 },
    ));
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return withCors(request, NextResponse.json(
        { success: false, message: '로그인이 필요합니다.' },
        { status: 401 },
      ));
    }

    const events = await prisma.event.findMany({
      where: { userId },
      include: {
        transactions: {
          select: { id: true, type: true, amount: true, isPaid: true, account: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    return withCors(request, NextResponse.json({
      success: true,
      events: events.map((e: any) => ({
        id: e.id,
        eventType: e.eventType,
        targetName: e.targetName,
        date: e.date.toISOString(),
        location: e.location,
        relation: e.relation,
        memo: e.memo,
        uiTheme: e.uiTheme,
        confidence: e.confidence,
        sourceUrl: e.sourceUrl,
        customEventName: e.customEventName,
        transactions: e.transactions,
      })),
    }));
  } catch (err: any) {
    console.error('[events] GET error:', err?.message);
    return withCors(request, NextResponse.json(
      { success: false, message: '조회에 실패했습니다.' },
      { status: 500 },
    ));
  }
}
