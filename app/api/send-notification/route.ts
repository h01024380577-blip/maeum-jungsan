import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { tossMessengerFetch } from '@/src/lib/tossMessengerFetch';
import { verifyJwt } from '@/src/lib/jwt';
import { corsResponse, withCors } from '@/src/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  let userId = req.cookies.get('toss_user_id')?.value;
  let userKey = req.cookies.get('toss_user_key')?.value;
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = verifyJwt(authHeader.slice(7));
    if (jwt) { userId = jwt.userId; userKey = jwt.userKey; }
  }

  if (!userId || !userKey) {
    return withCors(req, NextResponse.json({ ok: false, reason: 'not_logged_in' }));
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsEnabled: true },
  });

  if (!user?.notificationsEnabled) {
    return withCors(req, NextResponse.json({ ok: false, reason: 'not_enabled' }));
  }

  const templateCode = process.env.TOSS_MSG_TEMPLATE_CODE;
  if (!templateCode) {
    return withCors(req, NextResponse.json({ ok: false, reason: 'no_template_configured' }));
  }

  const body = await req.json().catch(() => ({}));
  const context = body.context ?? {};

  try {
    const result = await tossMessengerFetch(
      '/api-partner/v1/apps-in-toss/messenger/send-message',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-toss-user-key': userKey,
        },
        body: JSON.stringify({ templateSetCode: templateCode, context }),
      }
    );
    return withCors(req, NextResponse.json({ ok: true, result }));
  } catch {
    return withCors(req, NextResponse.json({ ok: false, reason: 'send_failed' }, { status: 500 }));
  }
}
