# 링크 분석 정확도 개선 설계

## 문제

현재 URL 분석 시 Gemini에 URL 문자열만 전달하여 AI가 실제 페이지 내용을 읽지 못함. 청첩장/부고장 등 동적 렌더링 사이트에서 핵심 정보(이름, 날짜, 장소, 계좌) 추출 불가.

## 해결 방향

서버 API Route에서 URL의 HTML을 직접 fetch하여 메타태그 + 본문 텍스트를 추출한 뒤, 실제 내용을 Gemini에 전달.

## 아키텍처

```
클라이언트 (HomeTab)
  ↓ POST /api/parse-url { url }
서버 API Route (app/api/parse-url/route.ts)
  ↓ fetch(url) → HTML
  ↓ 파싱: og 메타태그 + JSON-LD + body 텍스트
  ↓ Gemini API 호출 (실제 텍스트 전달)
  ↓ JSON 응답
클라이언트 ← 파싱 결과 수신
```

## 서버 API 상세: `/api/parse-url`

### 입력
```json
{ "url": "https://w.theirmood.com/card/dt8F6mWJu4" }
```

### 처리 흐름

1. **URL fetch**: 서버에서 `fetch(url)`로 HTML 가져오기 (User-Agent를 카카오봇으로 설정하여 og 메타태그 최대 노출 유도)
2. **메타태그 추출** (cheerio 사용):
   - `og:title`, `og:description`, `og:image`
   - `meta[name="description"]`
   - `<title>` 태그
   - JSON-LD (`<script type="application/ld+json">`)
3. **본문 텍스트 추출**: `<body>`에서 script/style/nav/footer 제거 후 텍스트
4. **텍스트 조합**: 메타태그 정보 + 본문 텍스트를 하나의 문자열로 조합
5. **Gemini 분석**: 조합된 텍스트를 Gemini에 전달하여 구조화된 JSON 추출
6. **응답 반환**: 파싱 결과 JSON

### 출력
```json
{
  "eventType": "wedding",
  "targetName": "김진호",
  "date": "2026-01-03",
  "location": "서울 강남구 ...",
  "relation": "",
  "account": "신한은행 110-xxx-xxxx",
  "type": "EXPENSE"
}
```

### User-Agent 전략

카카오톡 미리보기 봇으로 위장하면 대부분의 청첩장 서비스가 og 메타태그를 풍부하게 제공:
```
facebookexternalhit/1.1; kakaotalk-scrap/1.0
```

## 클라이언트 변경 (HomeTab)

기존 클라이언트 직접 Gemini 호출 → 서버 API 호출로 변경:

```
// 기존
const response = await ai.models.generateContent({ contents: `URL 분석: ${url}` })

// 변경
const res = await fetch('/api/parse-url', { method: 'POST', body: JSON.stringify({ url }) })
const parsed = await res.json()
```

서버 API 실패 시 기존 클라이언트 직접 Gemini 호출로 fallback.

## 의존성

- `cheerio`: HTML 파싱 (이미 package.json에 없음, 새로 설치 필요)
- `@google/genai`: Gemini API (서버사이드에서 사용, GEMINI_API_KEY 환경변수 필요)

## 환경변수

- `GEMINI_API_KEY`: 서버사이드 Gemini API 키 (NEXT_PUBLIC_ 아님, 서버 전용)

## 향후 확장 (Phase 2)

스크린샷 기반 fallback: 서버 텍스트 추출 결과가 부족할 때 headless browser로 스크린샷 → Gemini 멀티모달 분석. 현재는 미구현.
