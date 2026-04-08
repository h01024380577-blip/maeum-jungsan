import { NextRequest, NextResponse } from 'next/server';
import { tossPayFetch } from '@/src/lib/tossPayFetch';
import { verifyJwt } from '@/src/lib/jwt';
import { corsResponse, withCors } from '@/src/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  let tossUserKey = req.cookies.get('toss_user_key')?.value;
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const jwt = verifyJwt(authHeader.slice(7));
    if (jwt) tossUserKey = jwt.userKey;
  }

  if (!tossUserKey) {
    return withCors(req, NextResponse.json({ error: '토스 로그인이 필요합니다.' }, { status: 401 }));
  }

  const { amount, productDesc } = await req.json();
  const orderNo = `maeum-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const isTest = process.env.NODE_ENV !== 'production';

  try {
    const data = await tossPayFetch(
      '/api-partner/v1/apps-in-toss/pay/make-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-toss-user-key': tossUserKey,
        },
        body: JSON.stringify({
          orderNo,
          productDesc: productDesc || '경조사 축의금',
          amount,
          amountTaxFree: amount,
          cashReceipt: false,
          isTestPayment: isTest,
        }),
      }
    );

    if (data.resultType !== 'SUCCESS') {
      return withCors(req, NextResponse.json({ error: '결제 생성 실패', detail: data }, { status: 400 }));
    }

    return withCors(req, NextResponse.json({ payToken: data.success.payToken, orderNo }));
  } catch (e: any) {
    console.error('[payment/create]', e?.message);
    return withCors(req, NextResponse.json({ error: '결제 생성 중 오류가 발생했습니다.' }, { status: 500 }));
  }
}
