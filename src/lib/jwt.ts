import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'heartbook-dev-jwt-secret';

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString('base64url');
}

/** JWT 발급 (HS256, 14일 만료) */
export function signJwt(payload: { userId: string; userKey: string }): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
  }));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** JWT 검증 — 유효하면 payload, 아니면 null */
export function verifyJwt(token: string): { userId: string; userKey: string } | null {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, userKey: payload.userKey };
  } catch {
    return null;
  }
}
