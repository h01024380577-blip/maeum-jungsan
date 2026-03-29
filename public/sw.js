const VAPID_PUBLIC_KEY = 'BEm-p0mLRpFUf2KCCAkXssryxXSt-ubluosgR0psGehl7CYzQ1G7Hmflix7wWdQnDRdp7OjjwKr3MlBarGYDwDo';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = self.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || '💡 내일은 특별한 날이에요!';
  const options = {
    body: data.body || '잊지 말고 마음을 전해보세요.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(event.notification.data.url)
  );
});
