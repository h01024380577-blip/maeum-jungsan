import { NextResponse } from 'next/server';
import webpush from 'web-push';

function initVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails('mailto:h01024380577@gmail.com', pub, priv);
  }
}

export async function POST(request: Request) {
  initVapid();
  try {
    const { subscription, title, body } = await request.json();
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription is required' }, { status: 400 });
    }

    const payload = JSON.stringify({
      title: title || '테스트 알림',
      body: body || '푸시 알림 테스트입니다. 정상적으로 수신되었습니다!',
      url: '/'
    });

    await webpush.sendNotification(subscription, payload);
    return NextResponse.json({ success: true, message: 'Test notification sent' });
  } catch (error: any) {
    console.error('Test push failed:', error);
    return NextResponse.json({ error: 'Test push failed', details: error.message }, { status: 500 });
  }
}
