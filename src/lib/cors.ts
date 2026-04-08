import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://maeum-jungsan.apps.tossmini.com',
  'https://maeum-jungsan.private-apps.tossmini.com',
  'http://localhost:3000',
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

/** OPTIONS preflight 응답 */
export function corsResponse(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get('origin')),
  });
}

/** 기존 응답에 CORS 헤더 추가 */
export function withCors(req: NextRequest, response: NextResponse): NextResponse {
  const headers = getCorsHeaders(req.headers.get('origin'));
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
