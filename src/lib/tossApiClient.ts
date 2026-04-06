/**
 * 앱인토스 서버 API 공통 유틸
 * - mTLS: Node.js https 모듈 사용 (fetch는 Agent 미지원)
 * - 재시도 (지수 백오프)
 * - AES-256-GCM 복호화
 * - scope 안전 파싱
 */
import { createDecipheriv } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

export const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';

// mTLS 에이전트
function createMtlsAgent(): https.Agent | undefined {
  try {
    const certDir = process.env.MTLS_CERT_DIR ?? path.join(process.cwd(), 'certs');
    const keyPath = path.join(certDir, 'maeum-jungsan_private.key');
    const certPath = path.join(certDir, 'maeum-jungsan_public.crt');
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) return undefined;
    return new https.Agent({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      keepAlive: true,
    });
  } catch {
    return undefined;
  }
}

let _agent: https.Agent | undefined;
let _agentChecked = false;
function getAgent(): https.Agent | undefined {
  if (!_agentChecked) {
    _agent = createMtlsAgent();
    if (_agent) _agentChecked = true; // 성공하면 캐시, 실패하면 다음에 재시도
  }
  return _agent;
}

// https.request 기반 fetch 래퍼 (mTLS 지원)
function httpsRequest(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  retries?: number;
  baseDelay?: number;
}): Promise<{ status: number; json: () => Promise<any> }> {
  const { method = 'GET', headers = {}, body, retries = 2, baseDelay = 300 } = options;
  const agent = getAgent();

  const attempt = (n: number): Promise<{ status: number; json: () => Promise<any> }> =>
    new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const reqOpts: https.RequestOptions = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        agent,
      };
      const req = https.request(reqOpts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(JSON.parse(text)),
          });
        });
      });
      req.on('error', async (e) => {
        if (n < retries) {
          await sleep(baseDelay * 2 ** n);
          attempt(n + 1).then(resolve).catch(reject);
        } else {
          reject(e);
        }
      });
      if (body) req.write(body);
      req.end();
    });

  return attempt(0);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// 공개 인터페이스 - 기존 코드와 호환
export async function fetchWithRetry(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  retries?: number;
  baseDelay?: number;
} = {}): Promise<{ status: number; json: () => Promise<any> }> {
  return httpsRequest(url, options);
}

// AES-256-GCM 복호화
export function decryptField(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  const key = process.env.TOSS_DECRYPT_KEY;
  const aad = process.env.TOSS_DECRYPT_AAD;
  if (!key || !aad) return null;
  try {
    const IV_LENGTH = 12;
    const keyBuf = Buffer.from(key, 'base64');
    const decoded = Buffer.from(encrypted, 'base64');
    const iv = decoded.subarray(0, IV_LENGTH);
    const tag = decoded.subarray(decoded.length - 16);
    const ciphertext = decoded.subarray(IV_LENGTH, decoded.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(tag);
    decipher.setAAD(Buffer.from(aad));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// scope 안전 파싱
export function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean);
}

export function stringifyScopes(scopes: string[]): string {
  return scopes.join(' ');
}

// 만료 5분 전부터 갱신 대상
export function isTokenExpiringSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
}
