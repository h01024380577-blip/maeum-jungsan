import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'maeum-jungsan',
  brand: {
    displayName: '마음정산',
    primaryColor: '#3B82F6',
    icon: 'http://3.37.76.233:3000/icon.png',
  },
  web: {
    host: 'localhost',
    port: 3000,
    commands: {
      dev: 'next dev',
      build: 'next build',
    },
  },
  webViewProps: {
    type: 'partner',
  },
  permissions: [
    { name: 'clipboard', access: 'read' },
    { name: 'clipboard', access: 'write' },
    { name: 'contacts', access: 'read' },
  ] as any,
});
