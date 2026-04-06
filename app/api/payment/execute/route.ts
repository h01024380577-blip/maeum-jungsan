import { NextRequest, NextResponse } from 'next/server';
import { tossPayFetch } from '@/src/lib/tossPayFetch';

export async function POST(req: NextRequest) {
  const tossUserKey = req.cookies.get('toss_user_key')?.value;
  if (!tossUserKey) {
    return NextResponse.json({ error: '토스 로그인이 필요합니다.' }, { status: 401 });
  }

  const { payToken, orderNo } = await req.json();
  const isTest = process.env.NODE_ENV !== 'production';

  try {
    const data = await tossPayFetch(
      '/api-partner/v1/apps-in-toss/pay/execute-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-toss-user-key': tossUserKey,
        },
        body: JSON.stringify({ payToken, orderNo, isTestPayment: isTest }),
      }
    );

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[payment/execute]', e?.message);
    return NextResponse.json({ error: '결제 실행 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
