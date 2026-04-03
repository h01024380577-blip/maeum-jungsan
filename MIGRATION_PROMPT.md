# 마음정산 × 앱인토스 WV 마이그레이션 — Claude Code 작업 지시서 v3
# DB: AWS RDS (PostgreSQL + Prisma) 완전 통일

## 이 파일을 읽기 전에 (Claude Code 전용 설정)

작업 시작 전 아래 명령어로 앱인토스 공식 문서를 연결한다.

```bash
# 앱인토스 MCP 서버 연결
brew tap toss/tap && brew install ax
claude mcp add --transport stdio apps-in-toss ax mcp start

# Knowledge Skills 플러그인
/plugin marketplace add toss/apps-in-toss-skills
/plugin install knowlege-skills@apps-in-toss-skills
```

문서 URL 직접 주입:
- 기본: `https://developers-apps-in-toss.toss.im/llms.txt`
- 전체: `https://developers-apps-in-toss.toss.im/llms-full.txt`
- TDS: `https://tossmini-docs.toss.im/tds-mobile/llms-full.txt`

---

## 현재 코드베이스 현황

| 항목 | 현재 상태 |
|------|-----------|
| 프레임워크 | Next.js 15, App Router, React 19, TypeScript |
| 인증 | NextAuth v4 + KakaoProvider + PrismaAdapter |
| DB — 앱 데이터 | **Supabase** (supabase-js 클라이언트 직접 호출) |
| DB — 인증 | **Supabase** (Prisma ORM 경유, NextAuth 모델) |
| ORM | Prisma — `prisma/schema.prisma` |
| 상태 관리 | Zustand (`src/store/useStore.ts`) |
| AI | Gemini 2.5 Flash — **NEXT_PUBLIC_GEMINI_API_KEY로 클라이언트 직접 호출** (보안 취약) |
| PWA | `public/sw.js` Service Worker |
| 배포 | Vercel |

### 기존 Prisma 스키마 현황

`prisma/schema.prisma`에 이미 아래 모델이 존재한다:
- `User` (NextAuth용 — 교체 대상)
- `Account`, `Session`, `VerificationToken` (NextAuth 전용 — 삭제 대상)
- `Event`, `Transaction` (앱 데이터 — **이미 Prisma 기반, 유지**)

`app/api/events/route.ts`도 이미 Prisma 기반으로 구현되어 있다.
그러나 **`useStore.ts`는 여전히 supabase-js로 직접 Supabase를 호출**하고 있다.
이것이 RDS 통일 작업의 핵심 병목이다.

---

## 마이그레이션 목표

1. **인프라:** Vercel → AWS EC2
2. **DB:** Supabase → AWS RDS (PostgreSQL + Prisma 완전 통일)
3. **배포 채널:** 일반 웹앱 → 토스 앱인토스 WebView 미니앱
4. **인증:** NextAuth + 카카오 → 토스 로그인 SDK
5. **보안:** NEXT_PUBLIC Gemini API Key → 서버 전용으로 이동

---

## 심사 반려 기준 (출시 전 필수 통과)

| # | 항목 | 설명 |
|---|------|------|
| ① | NEXT_PUBLIC API Key 노출 금지 | 즉시 반려 |
| ② | 토스 로그인만 허용 | 카카오·자체 로그인 병행 불가 |
| ③ | TDS 필수 사용 | `@toss/tds-mobile` 미설치 → 반려 |
| ④ | 다크모드 미지원 선언 | 라이트 모드 고정 필수 |
| ⑤ | 핀치줌 비활성화 | `user-scalable=no` |
| ⑥ | 인트로 화면 필수 | 토스 로그인 전 서비스 소개 |
| ⑦ | 자사 앱 유도 금지 | 외부 앱 설치 유도 불가 |
| ⑧ | 스크롤 반응 2초 이내 | 지연 시 반려 가능 |

---

## 작업 목록 (각 TASK는 독립 커밋)

---

### TASK 1 — 앱인토스 SDK 설치 및 빌드 설정

**수정 파일:** `package.json`, `next.config.ts`, `granite.config.ts` (신규)

#### 1-1. SDK 설치

```bash
npm install @apps-in-toss/web-framework
npm install @toss/tds-mobile
```

#### 1-2. `granite.config.ts` 신규 생성

```ts
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
  webViewProps: { type: 'partner' },
  permissions: ['CLIPBOARD', 'CAMERA', 'CONTACTS', 'NOTIFICATION'],
});
```

#### 1-3. `next.config.ts` 수정

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: 'dist',   // granite build 결과물 경로
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos' }],
  },
};

export default nextConfig;
```

#### 1-4. `package.json` scripts 수정

```json
{
  "scripts": {
    "dev":        "granite dev",
    "build":      "granite build",
    "build:next": "prisma generate && next build",
    "start":      "next start",
    "lint":       "eslint ."
  }
}
```

#### 1-5. `app/layout.tsx` 수정 — 심사 기준 ④⑤

```tsx
export const metadata = {
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
};
```

---

### TASK 2 — Prisma 스키마 재구성 (RDS 통일 핵심)

**수정 파일:** `prisma/schema.prisma`

기존 스키마에서 NextAuth 모델을 제거하고, `useStore.ts`가 사용하는
`entries`/`contacts` 구조를 Prisma 모델로 흡수한다.
`Event`, `Transaction` 모델은 이미 있으므로 유지하되,
`useStore.ts`의 supabase-js 컬럼명과 매핑이 맞는지 확인한다.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")   // AWS RDS connection string
}

// ===== NextAuth 모델 전체 삭제 =====
// Account, Session, VerificationToken 제거

// ===== 인증 =====
model User {
  id           String    @id @default(cuid())
  tossUserKey  String    @unique          // 토스 userKey (숫자 → String)
  name         String?
  email        String?                    // nullable
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  contacts     Contact[]
  events       Event[]
  transactions Transaction[]
}

// ===== 연락처 (기존 Supabase contacts 테이블 대체) =====
model Contact {
  id        String   @id @default(cuid())
  userId    String
  name      String
  phone     String   @default("")
  kakaoId   String?
  relation  String   @default("")
  avatar    String?
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  events  Event[]

  @@index([userId])
}

// ===== 경조사 이벤트 (기존 Event 모델 유지 + contactId 추가) =====
enum EventType {
  WEDDING
  FUNERAL
  BIRTHDAY
  OTHER
}

enum UiTheme {
  DEFAULT
  SOLEMN
}

enum Confidence {
  HIGH
  MEDIUM
  LOW
}

model Event {
  id              String     @id @default(cuid())
  userId          String
  contactId       String?                    // Contact 연결 (선택)
  eventType       EventType
  targetName      String
  date            DateTime
  location        String     @default("")
  relation        String     @default("")
  sourceUrl       String?
  memo            String     @default("")
  customEventName String?
  account         String     @default("")    // useStore의 account 필드
  uiTheme         UiTheme    @default(DEFAULT)
  confidence      Confidence @default(MEDIUM)
  createdAt       DateTime   @default(now())

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  contact      Contact?      @relation(fields: [contactId], references: [id])
  transactions Transaction[]

  @@index([userId])
  @@index([date])
}

// ===== 거래 (기존 Transaction 모델 유지) =====
enum TransactionType {
  EXPENSE
  INCOME
}

model Transaction {
  id                  String          @id @default(cuid())
  eventId             String
  userId              String
  type                TransactionType
  amount              Int
  account             String          @default("")
  relation            String          @default("")
  recommendationReason String?
  isPaid              Boolean         @default(false)
  paidAt              DateTime?
  createdAt           DateTime        @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([eventId])
  @@index([userId])
}
```

#### 마이그레이션 실행

```bash
# 개발 환경
npx prisma migrate dev --name rds-unification-remove-nextauth

# 프로덕션 (AWS RDS)
npx prisma migrate deploy
```

---

### TASK 3 — 인증 교체: 카카오 OAuth → 토스 로그인

**심사 기준 ② ⑥**

**수정 파일:** `src/lib/auth.ts` (삭제), `src/lib/tossAuth.ts` (신규),
`app/api/auth/[...nextauth]/route.ts` (삭제), `app/api/auth/toss/route.ts` (신규),
`app/api/auth/me/route.ts` (신규), `components/Providers.tsx`

#### 3-1. `src/lib/tossAuth.ts` 신규 생성

```ts
import { appLogin } from '@apps-in-toss/web-framework';

export async function tossLogin() {
  // authorizationCode 유효시간: 10분
  return await appLogin();   // { authorizationCode, referrer }
}
```

#### 3-2. `app/api/auth/toss/route.ts` 신규 생성

토스 로그인 4단계를 서버에서 완전히 처리한다.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv } from 'crypto';
import { prisma } from '@/src/lib/prisma';

const TOSS_API = 'https://apps-in-toss-api.toss.im';

// AES-256-GCM 복호화 (콘솔 이메일에서 받은 키·AAD 사용)
function decrypt(encrypted: string): string {
  const key = Buffer.from(process.env.TOSS_DECRYPT_KEY!, 'base64');
  const aad = process.env.TOSS_DECRYPT_AAD!;
  const buf = Buffer.from(encrypted, 'base64');
  const iv  = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct  = buf.subarray(12, buf.length - 16);
  const d   = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  d.setAAD(Buffer.from(aad));
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

export async function POST(req: NextRequest) {
  const { authorizationCode, referrer } = await req.json();
  if (!authorizationCode) {
    return NextResponse.json({ error: 'Missing authorizationCode' }, { status: 400 });
  }

  // Step 2: AccessToken 발급
  const tokenRes = await fetch(
    `${TOSS_API}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode, referrer }),
    }
  );
  const tokenData = await tokenRes.json();
  const { accessToken } = tokenData.success ?? {};
  if (!accessToken) {
    return NextResponse.json({ error: '토큰 발급 실패' }, { status: 401 });
  }

  // Step 3: 사용자 정보 조회
  const userRes = await fetch(
    `${TOSS_API}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const userData = await userRes.json();
  const { userKey } = userData.success ?? {};
  if (!userKey) {
    return NextResponse.json({ error: '사용자 조회 실패' }, { status: 401 });
  }

  // Step 4: 복호화 후 RDS upsert
  // const name = decrypt(userData.success.name);  // 필요 시 활성화

  const user = await prisma.user.upsert({
    where:  { tossUserKey: String(userKey) },
    update: { updatedAt: new Date() },
    create: { tossUserKey: String(userKey) },
    select: { id: true },
  });

  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set('toss_user_id', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14,   // 14일 (refreshToken 수명과 동일)
  });
  return res;
}
```

#### 3-3. `app/api/auth/me/route.ts` 신규 생성

```ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const userId = req.cookies.get('toss_user_id')?.value;
  if (!userId) return NextResponse.json({ userId: null }, { status: 401 });
  return NextResponse.json({ userId });
}
```

#### 3-4. 기존 NextAuth 파일 삭제

```bash
rm app/api/auth/\[...nextauth\]/route.ts
rm src/lib/auth.ts
```

#### 3-5. `components/Providers.tsx` 수정

`SessionProvider` 제거, 토스 로그인 버튼 추가

```tsx
// 제거: import { SessionProvider } from 'next-auth/react'
// 제거: <SessionProvider>...</SessionProvider>
// 앱 전체에서 세션이 필요한 곳은 /api/auth/me 쿠키로 대체
```

#### 3-6. 심사 기준 ⑥ — 인트로 화면 신규 생성

`app/intro/page.tsx`를 생성한다.
비로그인 사용자는 홈 진입 시 이 페이지로 리다이렉트한다.
토스 로그인 버튼 클릭 → `appLogin()` → `POST /api/auth/toss` 흐름을 구현한다.

```tsx
// app/intro/page.tsx
'use client';
import { tossLogin } from '@/src/lib/tossAuth';
import { useRouter } from 'next/navigation';

export default function IntroPage() {
  const router = useRouter();

  const handleLogin = async () => {
    const result = await tossLogin();
    if (!result) return;
    const res = await fetch('/api/auth/toss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    if (res.ok) router.replace('/');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5">
      <h1 className="text-2xl font-black mb-2">마음정산</h1>
      <p className="text-sm text-gray-400 mb-8 text-center">
        경조사 마음을 스마트하게 정산하세요
      </p>
      <button
        onClick={handleLogin}
        className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-base"
      >
        토스로 시작하기
      </button>
    </div>
  );
}
```

#### 3-7. NextAuth 의존성 제거

```bash
npm uninstall next-auth @auth/prisma-adapter
```

---

### TASK 4 — API 보안: 클라이언트 Gemini 호출 → 서버 Route Handler

**심사 기준 ① — 미처리 시 즉시 반려**

**수정 파일:** `src/tabs/HomeTab.tsx`, `app/api/analyze/route.ts` (신규)

#### 4-1. `app/api/analyze/route.ts` 신규 생성

```ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const SYSTEM_INSTRUCTION = `Extract event info in JSON only.
Fields: eventType("wedding"|"funeral"|"birthday"|"other"),
date(YYYY-MM-DD, default current year), location, targetName,
relation("가족"|"절친"|"직장 동료"|"지인"),
type("EXPENSE"|"INCOME"), account(bank info).
Respond ONLY with valid JSON, no markdown.`;

export async function POST(req: NextRequest) {
  const { type, data } = await req.json();

  try {
    let responseText = '{}';

    if (type === 'text') {
      const r = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: data,
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
      });
      responseText = r.text ?? '{}';

    } else if (type === 'image') {
      const b64 = (data as string).includes(',') ? data.split(',')[1] : data;
      const r = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ inlineData: { data: b64, mimeType: 'image/jpeg' } }, { text: '경조사 정보 추출' }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
      });
      responseText = r.text ?? '{}';

    } else if (type === 'url') {
      // 기존 /api/parse-url 3단계 파이프라인 재활용
      const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const res = await fetch(`${base}/api/parse-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data }),
      });
      return NextResponse.json(await res.json());
    }

    return NextResponse.json({ success: true, data: JSON.parse(responseText) });

  } catch (e: any) {
    const isRateLimit = e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
    return NextResponse.json(
      { success: false, reason: isRateLimit ? 'rate_limit' : 'parse_error' },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
```

#### 4-2. `HomeTab.tsx` 수정

```ts
// ❌ 제거
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

// ✅ 교체: handleParse 내부
const res = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type, data }),
});
const result = await res.json();
if (!result.success) {
  if (result.reason === 'rate_limit') toast.error('무료 분석 한도를 모두 이용하셨습니다.');
  else toast.error('분석 실패. 직접 입력을 이용해 주세요.');
  return;
}
```

#### 4-3. 환경변수 정리

```env
# 제거
NEXT_PUBLIC_GEMINI_API_KEY=...

# 서버 전용으로만 유지
GEMINI_API_KEY=...
```

---

### TASK 5 — useStore.ts 완전 교체: Supabase → API Route (RDS 통일 핵심)

**수정 파일:** `src/store/useStore.ts`, `app/api/entries/route.ts` (신규),
`app/api/contacts/route.ts` (신규), `src/lib/supabase.ts` (삭제)

이 TASK가 RDS 통일의 실질적인 핵심이다.
`useStore.ts`의 모든 `supabase.from(...)` 호출을 서버 API Route로 교체한다.

#### 5-1. `app/api/entries/route.ts` 신규 생성

`app/api/events/route.ts`가 이미 Prisma 기반으로 구현되어 있다.
기존 `app/api/events/route.ts`를 확장하여 `useStore.ts`가 필요한
모든 CRUD 엔드포인트를 추가한다.

필요한 엔드포인트:
- `GET /api/entries` — 전체 목록 (userId 기반)
- `POST /api/entries` — 단건 저장
- `DELETE /api/entries?id=xxx` — 단건 삭제
- `PATCH /api/entries?id=xxx` — 단건 수정

```ts
// app/api/entries/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

async function getUserIdFromCookie(req: NextRequest): Promise<string | null> {
  return req.cookies.get('toss_user_id')?.value ?? null;
}

// useStore의 EventEntry 타입과 Prisma Event+Transaction을 매핑
function toEventEntry(event: any, tx: any) {
  return {
    id: event.id,
    contactId: event.contactId ?? '',
    eventType: event.eventType.toLowerCase(),
    type: tx?.type ?? 'EXPENSE',
    date: event.date.toISOString().split('T')[0],
    location: event.location,
    targetName: event.targetName,
    account: tx?.account ?? event.account ?? '',
    amount: tx?.amount ?? 0,
    relation: event.relation,
    recommendationReason: tx?.recommendationReason ?? '',
    customEventName: event.customEventName ?? '',
    memo: event.memo,
    isIncome: (tx?.type ?? 'EXPENSE') === 'INCOME',
    createdAt: event.createdAt.getTime(),
    userId: event.userId,
  };
}

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromCookie(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const events = await prisma.event.findMany({
    where: { userId },
    include: { transactions: { take: 1, orderBy: { createdAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    entries: events.map(e => toEventEntry(e, e.transactions[0])),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromCookie(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  // body: useStore addEntry 파라미터와 동일

  const result = await prisma.$transaction(async (tx) => {
    // Contact upsert
    let contactId = body.contactId || null;
    if (!contactId && body.targetName) {
      const existing = await tx.contact.findFirst({
        where: { userId, name: body.targetName },
      });
      if (existing) {
        contactId = existing.id;
      } else {
        const c = await tx.contact.create({
          data: { userId, name: body.targetName, relation: body.relation || '지인' },
        });
        contactId = c.id;
      }
    }

    const event = await tx.event.create({
      data: {
        userId,
        contactId,
        eventType: body.eventType.toUpperCase(),
        targetName: body.targetName,
        date: new Date(body.date),
        location: body.location ?? '',
        relation: body.relation ?? '',
        memo: body.memo ?? '',
        account: body.account ?? '',
        customEventName: body.customEventName ?? null,
      },
    });

    const transaction = await tx.transaction.create({
      data: {
        eventId: event.id,
        userId,
        type: body.type ?? 'EXPENSE',
        amount: Number(body.amount) || 0,
        account: body.account ?? '',
        relation: body.relation ?? '',
        recommendationReason: body.recommendationReason ?? '',
      },
    });

    return { event, transaction };
  });

  return NextResponse.json({
    entry: toEventEntry(result.event, result.transaction),
  });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromCookie(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.event.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromCookie(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();

  const eventUpdates: any = {};
  if (body.date)      eventUpdates.date     = new Date(body.date);
  if (body.location)  eventUpdates.location = body.location;
  if (body.eventType) eventUpdates.eventType = body.eventType.toUpperCase();
  if (body.memo)      eventUpdates.memo     = body.memo;
  if (body.relation)  eventUpdates.relation = body.relation;

  const txUpdates: any = {};
  if (body.amount)    txUpdates.amount = Number(body.amount);
  if (body.type)      txUpdates.type   = body.type;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(eventUpdates).length)
      await tx.event.updateMany({ where: { id, userId }, data: eventUpdates });
    if (Object.keys(txUpdates).length)
      await tx.transaction.updateMany({ where: { eventId: id, userId }, data: txUpdates });
  });

  return NextResponse.json({ ok: true });
}
```

#### 5-2. `app/api/contacts/route.ts` 신규 생성

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

async function getUserIdFromCookie(req: NextRequest) {
  return req.cookies.get('toss_user_id')?.value ?? null;
}

function toContact(row: any) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    kakaoId: row.kakaoId ?? '',
    relation: row.relation ?? '',
    avatar: row.avatar ?? '',
    userId: row.userId,
  };
}

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromCookie(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contacts = await prisma.contact.findMany({ where: { userId } });
  return NextResponse.json({ contacts: contacts.map(toContact) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromCookie(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const contact = await prisma.contact.create({
    data: {
      userId,
      name: body.name,
      phone: body.phone ?? '',
      kakaoId: body.kakaoId ?? '',
      relation: body.relation ?? '',
      avatar: body.avatar ?? '',
    },
  });
  return NextResponse.json({ contact: toContact(contact), id: contact.id });
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromCookie(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();
  const updates: any = {};
  if (body.name     !== undefined) updates.name     = body.name;
  if (body.phone    !== undefined) updates.phone    = body.phone;
  if (body.relation !== undefined) updates.relation = body.relation;

  await prisma.contact.updateMany({ where: { id, userId }, data: updates });
  return NextResponse.json({ ok: true });
}
```

#### 5-3. `useStore.ts` 전면 교체

`supabase` import 제거, 모든 supabase-js 호출을 fetch API Route로 교체한다.

```ts
import { create } from 'zustand';
import { getDeviceId } from '@apps-in-toss/web-framework';

// (EventEntry, Contact, AppState 타입 정의는 기존과 동일)

// getUserId: 토스 로그인 쿠키 → SDK 기기 ID → localStorage fallback
async function getUserId(): Promise<string> {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const { userId } = await res.json();
      if (userId) return userId;
    }
  } catch {}
  try {
    return await getDeviceId();
  } catch {
    const stored = localStorage.getItem('heartbook-device-id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('heartbook-device-id', id);
    return id;
  }
}

export const useStore = create<AppState>()((set, get) => ({
  // ... 초기 상태 동일 ...

  // loadFromSupabase → loadFromRDS (함수명 변경 권장)
  loadFromSupabase: async () => {
    try {
      const [entriesRes, contactsRes] = await Promise.all([
        fetch('/api/entries').then(r => r.json()),
        fetch('/api/contacts').then(r => r.json()),
      ]);
      set({
        entries: entriesRes.entries ?? [],
        contacts: contactsRes.contacts ?? [],
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  addEntry: async (entry) => {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const { entry: saved } = await res.json();
    set(state => ({ entries: [saved, ...state.entries] }));
  },

  removeEntry: async (id) => {
    await fetch(`/api/entries?id=${id}`, { method: 'DELETE' });
    set(state => ({ entries: state.entries.filter(e => e.id !== id) }));
  },

  updateEntry: async (id, updatedFields) => {
    await fetch(`/api/entries?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      entries: state.entries.map(e => e.id === id ? { ...e, ...updatedFields } : e),
    }));
  },

  addContact: async (contact) => {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    });
    const { contact: saved, id } = await res.json();
    set(state => ({ contacts: [...state.contacts, saved] }));
    return id;
  },

  updateContact: async (id, updatedFields) => {
    await fetch(`/api/contacts?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      contacts: state.contacts.map(c => c.id === id ? { ...c, ...updatedFields } : c),
    }));
  },

  syncContacts: async (newContacts) => {
    const existing = new Set(get().contacts.map(c => c.name));
    for (const c of newContacts.filter(c => !existing.has(c.name))) {
      await get().addContact(c);
    }
  },

  bulkAddEntries: async (entries) => {
    for (const e of entries) await get().addEntry(e);
  },

  // addFeedback, setAnalysisResult, resetAnalysis 기존 동일
}));
```

#### 5-4. Supabase 관련 파일 삭제

```bash
rm src/lib/supabase.ts
```

`package.json`에서 supabase 패키지도 제거한다:

```bash
npm uninstall @supabase/supabase-js
```

---

### TASK 6 — 앱인토스 SDK 함수로 디바이스 기능 교체

**수정 파일:** `src/tabs/HomeTab.tsx`, `components/Layout.tsx`

로컬 개발 시 fallback 패턴을 모든 SDK 호출 지점에 적용한다:

```ts
function isAppsInToss(): boolean {
  return typeof window !== 'undefined' &&
    window.navigator.userAgent.includes('TossApp');
}
```

#### 6-1. 클립보드

```ts
import { getClipboardText } from '@apps-in-toss/web-framework';
const text = isAppsInToss()
  ? await getClipboardText()
  : await navigator.clipboard.readText();
```

#### 6-2. 이미지 업로드

```ts
import { openCamera, fetchAlbumPhotos } from '@apps-in-toss/web-framework';

async function handleCameraCapture() {
  if (!isAppsInToss()) { fileInputRef.current?.click(); return; }
  const r = await openCamera();
  if (r?.base64) handleParse({ type: 'image', data: `data:image/jpeg;base64,${r.base64}` });
}
```

#### 6-3. 내비게이션 바

```ts
import { setNavigationBar } from '@apps-in-toss/web-framework';
useEffect(() => {
  if (isAppsInToss()) setNavigationBar({ title: '마음정산', visible: true });
}, []);
```

#### 6-4. 계좌번호 캡처 차단

```ts
import { setSecureScreen } from '@apps-in-toss/web-framework';
// 바텀시트 open 시
if (isAppsInToss()) setSecureScreen(true);
// 바텀시트 close 시
if (isAppsInToss()) setSecureScreen(false);
```

#### 6-5. 저장 완료 햅틱

```ts
import { generateHapticFeedback } from '@apps-in-toss/web-framework';
if (isAppsInToss()) generateHapticFeedback({ type: 'success' });
```

---

### TASK 7 — PWA 제거

```bash
rm public/sw.js
```

`app/layout.tsx`에서 sw.js 등록 코드 제거.

---

### TASK 8 — AWS 배포 환경 구성

**신규 파일:** `Dockerfile`, `.env.production.example`

#### 8-1. `Dockerfile`

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build:next

FROM base AS runner
ENV NODE_ENV=production
RUN npm ci --only=production && npx prisma generate
COPY --from=builder /app/dist     ./dist
COPY --from=builder /app/public   ./public
COPY --from=builder /app/prisma   ./prisma
COPY --from=builder /app/package.json .
EXPOSE 3000
CMD ["npm", "run", "start"]
```

#### 8-2. `.env.production.example`

```env
# 앱
NEXT_PUBLIC_APP_URL=https://your-domain.com

# DB — AWS RDS PostgreSQL (Supabase 환경변수 전체 제거)
DATABASE_URL=postgresql://user:pass@your-rds.amazonaws.com:5432/maeum_jungsan

# AI — 서버 전용, NEXT_PUBLIC 아님
GEMINI_API_KEY=xxxx

# 토스 로그인 (콘솔에서 발급)
TOSS_CLIENT_ID=xxxx
TOSS_CLIENT_SECRET=xxxx
TOSS_DECRYPT_KEY=xxxx   # AES-256-GCM 복호화 키 (Base64, 콘솔 이메일 수신)
TOSS_DECRYPT_AAD=xxxx   # AAD (콘솔 이메일 수신)
```

#### 8-3. 기존 Supabase 환경변수 제거

아래 변수들은 완전히 제거한다:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## 작업 순서 요약

| 순서 | 작업 | 위험도 | 심사 필수 | 예상 시간 |
|------|------|--------|-----------|-----------|
| TASK 1 | SDK + granite.config.ts | 낮음 | ③④⑤ | 30분 |
| TASK 2 | Prisma 스키마 재구성 | 높음 | — | 1~2시간 |
| TASK 3 | 인증 교체 (토스 로그인) | 높음 | ② ⑥ | 3~4시간 |
| TASK 4 | Gemini 서버 이동 | 중간 | ① | 1~2시간 |
| TASK 5 | useStore → API Route (RDS 핵심) | 높음 | — | 4~6시간 |
| TASK 6 | SDK 함수 교체 | 낮음 | — | 1시간 |
| TASK 7 | PWA 제거 | 낮음 | — | 10분 |
| TASK 8 | AWS 배포 설정 | 중간 | — | 1~2시간 |

## 최종 데이터 계층 (Supabase 완전 제거)

```
AWS RDS (PostgreSQL 단일)
├── User         ← Prisma (토스 tossUserKey)
├── Contact      ← Prisma (연락처)
├── Event        ← Prisma (경조사 이벤트)
└── Transaction  ← Prisma (금액 기록)

접근 경로:
클라이언트(useStore.ts) → fetch API Route → Prisma → RDS
```

## 주의사항

1. **TASK 2(스키마)를 TASK 5(useStore) 전에 완료**해야 한다. DB 구조가 먼저 확정되어야 API Route 구현이 가능하다.
2. **TASK 3(인증)과 TASK 4(보안)는 동시 배포**해야 한다. 보안 취약점이 심사 즉시 반려로 이어진다.
3. **기존 Supabase 데이터 마이그레이션**: 운영 중 데이터가 있다면 `pg_dump`로 Supabase → RDS 이전이 필요하다. 테이블 구조가 변경되므로 컬럼 매핑을 직접 작성해야 한다.
4. **토스 로그인 인가코드 유효시간은 10분**이다. 클라이언트에서 받은 즉시 `/api/auth/toss`로 전달해야 한다.
5. **로컬 개발 시** 앱인토스 SDK는 토스 앱 WebView에서만 동작한다. `isAppsInToss()` fallback을 모든 SDK 호출에 적용한다.
6. **`granite build` 결과물 경로**를 `next.config.ts`의 `distDir`과 `granite.config.ts`의 `outdir`이 일치하도록 설정해야 배포가 정상 동작한다.
