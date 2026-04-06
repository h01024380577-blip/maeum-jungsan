import { NextRequest, NextResponse } from 'next/server';
import { tossPayFetch } from '@/src/lib/tossPayFetch';

export async function POST(req: NextRequest) {
  const tossUserKey = req.cookies.get('toss_user_key')?.value;
  if (!tossUserKey) {
    return NextResponse.json({ error: '토스 로그인이 필요합니다.' }, { status: 401 });
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
      return NextResponse.json({ error: '결제 생성 실패', detail: data }, { status: 400 });
    }

    return NextResponse.json({ payToken: data.success.payToken, orderNo });
  } catch (e: any) {
    console.error('[payment/create]', e?.message);
    return NextResponse.json({ error: '결제 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
