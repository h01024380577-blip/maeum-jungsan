import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin 초기화 (중복 방지)
if (getApps().length === 0) {
  try {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0250392989' });
  } catch (e) {
    console.error('Firebase Admin init failed:', e);
  }
}

function initVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails('mailto:h01024380577@gmail.com', pub, priv);
  }
}

export async function GET(request: Request) {
  initVapid();
  // Vercel Cron 인증
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getFirestore();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const entriesSnapshot = await db.collection('entries').where('date', '==', tomorrowStr).get();

    if (entriesSnapshot.empty) {
      return NextResponse.json({ message: 'No events for tomorrow' });
    }

    const notifications = [];

    for (const entryDoc of entriesSnapshot.docs) {
      const entry = entryDoc.data();
      const userId = entry.userId;

      const subDoc = await db.collection('subscriptions').doc(userId).get();
      if (!subDoc.exists) continue;

      const subscription = subDoc.data()!;
      const pushConfig = { endpoint: subscription.endpoint, keys: subscription.keys };

      const eventName = entry.eventType === 'other' ? entry.customEventName :
        entry.eventType === 'wedding' ? '결혼식' :
        entry.eventType === 'funeral' ? '장례식' : '생일';

      const payload = JSON.stringify({
        title: `내일은 ${entry.targetName}님의 ${eventName} 날이에요!`,
        body: '잊지 말고 축하 메시지나 마음을 전해보세요.',
        url: `/contacts/${entry.contactId}`
      });

      notifications.push(
        webpush.sendNotification(pushConfig, payload).catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.collection('subscriptions').doc(userId).delete();
          }
        })
      );
    }

    await Promise.all(notifications);
    return NextResponse.json({ message: `Sent ${notifications.length} notifications` });
  } catch (error: any) {
    console.error('Cron notify failed:', error);
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
  }
}
