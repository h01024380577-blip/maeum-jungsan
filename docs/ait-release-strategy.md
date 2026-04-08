# Apps-in-Toss 출시 전략: SSR → CSR 분리

## 현재 상황

마음정산은 **Next.js SSR + API Routes** 구조로, `.ait` 번들 생성 불가.
- `ait build` 에러: "Web build output requires dist/web/index.html. Currently only CSR / SSG environments are supported."
- Apps-in-Toss `.ait` 번들은 정적 HTML/JS/CSS 파일만 패키징 가능

---

## 목표 아키텍처

```
[.ait 번들]  정적 프론트엔드 (Next.js CSR)
               ↓ API fetch
[EC2 서버]   API 서버 (Next.js API Routes만 분리 운영)
```

---

## DB 관련 검토 결과

### 안전한 부분
- Prisma 클라이언트는 `app/api/` 내부에서만 사용 — 클라이언트 컴포넌트에서 직접 DB 접근 없음
- `DATABASE_URL`, `DIRECT_URL` 모두 `NEXT_PUBLIC_` 접두사 없음 → CSR 번들에 노출 위험 없음
- 분리 후 API 서버에 Prisma를 그대로 두면 DB 연결 문제 없음

### 반드시 수정해야 할 부분

**① `NEXT_PUBLIC_GEMINI_API_KEY` 노출 제거 (보안)**

현재 `app/api/parse-url/route.ts`에 아래 코드 존재:
```ts
const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
```
CSR 빌드 시 `NEXT_PUBLIC_*` 값은 번들에 포함되어 클라이언트에 노출됨.
출시 전 `NEXT_PUBLIC_GEMINI_API_KEY` fallback 제거, `GEMINI_API_KEY`만 사용.

**② 크로스 도메인 쿠키 인증 (가장 큰 문제)**

현재 인증 구조: `httpOnly` 쿠키(`toss_user_id`, `toss_user_key`)를 API 서버에서 설정.
CSR 앱 도메인(`maeum-jungsan.apps.tossmini.com`)과 API 서버 도메인이 달라지면 쿠키 전달 불가.

해결 방법 (둘 중 선택):
- **옵션 1** — 쿠키 → `Authorization: Bearer <token>` 방식으로 인증 변경 (권장)
  - Toss 로그인 후 서버에서 JWT 발급 → 클라이언트에서 localStorage 저장 → 매 요청 헤더에 포함
- **옵션 2** — API 서버 도메인을 같은 상위 도메인 서브도메인으로 통일
  - 토스 제공 도메인과 별도 도메인이라 사실상 불가능

---

## 분리 작업 목록

### 1. Next.js 정적 export 설정

`next.config.ts`에 추가:
```ts
output: 'export',
distDir: 'dist',
```

이후 `ait build` 실행 시 `dist/web/index.html` 생성됨.

**주의:** `output: 'export'` 설정 시 API Routes는 빌드에서 제외됨.

---

### 2. API 서버 분리

API Routes(`app/api/`)를 별도 프로젝트 또는 EC2의 독립 서버로 분리 운영.

**옵션 A** — 현재 EC2 서버를 API 전용으로 유지
- `next.config.ts`에서 `output: 'export'` 설정 후 프론트만 CSR 빌드
- EC2에는 API Routes만 남긴 별도 Next.js 앱 배포
- 프론트에서 `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` 환경변수로 호출

**옵션 B** — API를 Express/Fastify로 재작성
- 현재 `app/api/` 라우트를 독립 Express 서버로 이전
- Prisma 클라이언트는 그대로 재사용 가능

---

### 3. 프론트엔드 API 호출 URL 수정

현재 모든 fetch가 상대경로(`/api/...`)로 되어 있음 → 절대 URL로 변경 필요.

```ts
// 현재
const res = await fetch('/api/entries', { ... });

// 변경 후
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const res = await fetch(`${BASE_URL}/api/entries`, { ... });
```

영향 받는 주요 파일:
- `src/store/useStore.ts` — 모든 CRUD fetch 호출
- `src/tabs/HomeTab.tsx` — parse-url, analyze 호출
- `components/Providers.tsx` — auth/toss, auth/me 호출
- `src/components/BulkImportModal.tsx`
- `src/hooks/useEvents.ts`

---

### 4. 쿠키 인증 처리

현재 `toss_user_id` 쿠키를 `httpOnly`로 서버에서 설정 중.
CSR + 별도 API 서버 구조에서는 **크로스 도메인 쿠키** 문제 발생 가능.

해결 방법:
- API 서버 도메인과 앱 도메인을 같은 최상위 도메인으로 통일 (권장)
- 또는 쿠키 대신 `Authorization: Bearer <token>` 방식으로 변경

---

### 5. CORS 설정

출시 후 앱이 로드되는 도메인에서 API 호출이 가능하도록 CORS 허용 필요.

허용해야 할 Origin:
```
https://maeum-jungsan.apps.tossmini.com       # 실서비스
https://maeum-jungsan.private-apps.tossmini.com  # QR 테스트
http://localhost:3000                           # 로컬 개발
```

---

### 6. 환경변수 정리

`.env.production` 기준으로 정리:

| 변수 | 위치 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | 프론트 | API 서버 베이스 URL |
| `DATABASE_URL` | API 서버 | PostgreSQL 연결 |
| `GEMINI_API_KEY` | API 서버 | Gemini AI (서버 전용) |
| `TOSS_DECRYPT_KEY` | API 서버 | Toss 인증 복호화 |
| `CRON_SECRET` | API 서버 | 크론 엔드포인트 보호 |

---

## 작업 순서 (출시 시점에)

1. [ ] API 서버 분리 (옵션 A 또는 B 선택)
2. [ ] EC2에 API 서버 배포 + 도메인/HTTPS 설정
3. [ ] `NEXT_PUBLIC_API_URL` 환경변수 추가
4. [ ] `useStore.ts` 및 fetch 호출 전체 절대 URL로 수정
5. [ ] 쿠키 인증 크로스도메인 처리
6. [ ] CORS 설정 추가
7. [ ] `next.config.ts`에 `output: 'export'` 추가
8. [ ] `ait build` 실행 → `.ait` 파일 생성 확인
9. [ ] 샌드박스 앱에서 최종 테스트
10. [ ] 앱인토스 콘솔에 번들 업로드 → 검토 요청 (영업일 최대 3일)
11. [ ] 승인 후 출시

---

## 참고

- Apps-in-Toss WebView 가이드: https://developers-apps-in-toss.toss.im/tutorials/webview.md
- 미니앱 출시 가이드: https://developers-apps-in-toss.toss.im/development/deploy.md
- 비게임 출시 체크리스트: https://developers-apps-in-toss.toss.im/checklist/app-nongame.md
