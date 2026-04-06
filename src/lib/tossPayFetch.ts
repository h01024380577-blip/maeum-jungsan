import https from 'https';
import fs from 'fs';
import path from 'path';

const TOSS_PAY_BASE = 'https://pay-apps-in-toss-api.toss.im';

/**
 * mTLS 인증서를 포함한 토스페이 API fetch 헬퍼
 * Node.js https 모듈 사용 (기본 fetch는 mTLS 미지원)
 */
export async function tossPayFetch(
  endpoint: string,
  options: { method: string; headers: Record<string, string>; body?: string }
): Promise<any> {
  const certPath = process.env.TOSS_MTLS_CERT_PATH ||
    path.join(process.cwd(), 'maeum-jungsan_public.crt');
  const keyPath = process.env.TOSS_MTLS_KEY_PATH ||
    path.join(process.cwd(), 'maeum-jungsan_private.key');

  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);

  return new Promise((resolve, reject) => {
    const url = new URL(`${TOSS_PAY_BASE}${endpoint}`);
    const reqOptions: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: options.method,
      headers: options.headers,
      cert,
      key,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse error: ${data}`)); }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
