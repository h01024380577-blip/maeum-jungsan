import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'maeum-jungsan',
  brand: {
    displayName: '마음정산',
    primaryColor: '#3B82F6',
    icon: '',
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
  permissions: ['CLIPBOARD', 'CAMERA', 'CONTACTS', 'NOTIFICATION'],
});
