import { appLogin } from '@apps-in-toss/web-framework';

export async function tossLogin(): Promise<{ authorizationCode: string; referrer: string } | null> {
  try {
    return await appLogin();
  } catch (e) {
    console.error('[tossAuth] appLogin 실패:', e);
    return null;
  }
}
