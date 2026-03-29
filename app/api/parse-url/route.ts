import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { fetchPageHtml } from '@/src/lib/fetchPage';
import { extractMetaTags, extractJsonLd, extractBodyText, hasEnoughData } from '@/src/lib/parseUrl';

const SYSTEM_INSTRUCTION = `너는 한국 경조사 초대장 분석 전문가야.
제공되는 데이터에서 경조사 정보를 추출해 JSON으로 반환해.

핵심 규칙:
1. 반드시 제공된 데이터에 있는 정보만 사용해.
2. 없는 정보는 빈 문자열("")로 반환해.
3. 절대 추측하지 마. 데이터에 명시되지 않은 이름, 날짜, 장소를 만들어내지 마.
4. 결혼식이면 targetName에 신랑 이름만 넣어.
5. 날짜는 반드시 YYYY-MM-DD 형식으로. 연도가 없으면 2026년으로 가정.
6. 계좌번호는 "은행명 계좌번호 예금주" 형식으로.`;

const OUTPUT_SCHEMA = `{
  "eventType": "wedding|funeral|birthday|other",
  "targetName": "주인공 이름 (결혼식이면 신랑 이름)",
  "date": "YYYY-MM-DD",
  "location": "장소명, 전체 주소",
  "relation": "",
  "account": "은행명 계좌번호 예금주",
  "type": "EXPENSE"
}`;

function parseAiResponse(text: string): any {
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) : {}; } catch { return {}; }
  }
}

function normalizeData(parsed: any) {
  return {
    eventType: parsed.eventType || 'other',
    targetName: parsed.targetName || '',
    date: parsed.date || '',
    location: parsed.location || '',
    relation: parsed.relation || '',
    account: parsed.account || '',
    type: parsed.type || 'EXPENSE',
  };
}

function calculateConfidence(data: any): 'high' | 'medium' | 'low' {
  const filled = [data.targetName, data.date, data.location]
    .filter((v: string) => v && v.trim() !== '').length;
  return filled >= 3 ? 'high' : filled >= 2 ? 'medium' : 'low';
}

/**
 * Jina Reader API로 JS 렌더링된 페이지 텍스트 가져오기
 * SPA 사이트에서도 실제 콘텐츠를 추출할 수 있음
 */
async function fetchRenderedText(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Markdown 이미지 태그 제거, 3000자 제한
    return text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[Image.*?\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 3000);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body?.url;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, reason: 'invalid_url', message: 'URL이 필요합니다.' },
        { status: 400 },
      );
    }
    try { new URL(url); } catch {
      return NextResponse.json(
        { success: false, reason: 'invalid_url', message: '올바른 URL 형식이 아닙니다.' },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, reason: 'ai_failed', message: 'API 키가 설정되지 않았습니다.' },
        { status: 500 },
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // ========== Phase 1: 서버사이드 HTML 파싱 ==========
    let meta = { title: '', description: '', image: '', siteName: '' };
    let jsonLd: object | null = null;
    let bodyText = '';
    let fetchSuccess = false;

    try {
      const html = await fetchPageHtml(url);
      fetchSuccess = true;
      meta = extractMetaTags(html);
      jsonLd = extractJsonLd(html);
      bodyText = extractBodyText(html);
    } catch {}

    // Phase 1a: og + body 텍스트가 충분하면 바로 분석
    if (fetchSuccess && hasEnoughData(meta, bodyText) && bodyText.length > 50) {
      try {
        const parts: string[] = [];
        if (meta.title) parts.push(`제목: ${meta.title}`);
        if (meta.description) parts.push(`설명: ${meta.description}`);
        if (jsonLd) parts.push(`JSON-LD: ${JSON.stringify(jsonLd)}`);
        parts.push(`본문: ${bodyText}`);
        parts.push(`\n위 데이터에서 다음 JSON을 추출해:\n${OUTPUT_SCHEMA}`);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: parts.join('\n'),
          config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
        });
        const data = normalizeData(parseAiResponse(response.text || '{}'));
        const confidence = calculateConfidence(data);

        if (confidence !== 'low') {
          return NextResponse.json({ success: true, data, confidence, source: 'og+body' });
        }
      } catch (e: any) {
        console.error('[parse-url] Phase 1a error:', e?.message);
      }
    }

    // ========== Phase 2: Jina Reader (SPA 렌더링 대응) ==========
    // JS로 동적 렌더링되는 사이트의 실제 콘텐츠를 가져옴
    try {
      const renderedText = await fetchRenderedText(url);
      if (renderedText && renderedText.length > 100) {
        const prompt = `아래는 경조사 초대장 웹페이지의 텍스트 내용이야.
이 데이터에서 경조사 정보를 추출해줘.

${renderedText}

위 데이터에서 다음 JSON을 추출해:
${OUTPUT_SCHEMA}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
        });
        const data = normalizeData(parseAiResponse(response.text || '{}'));
        const confidence = calculateConfidence(data);

        if (confidence !== 'low') {
          return NextResponse.json({ success: true, data, confidence, source: 'rendered' });
        }
      }
    } catch (e: any) {
      console.error('[parse-url] Phase 2 (Jina) error:', e?.message);
    }

    // ========== Phase 3: Gemini urlContext (최후 수단) ==========
    try {
      const prompt = `다음 URL은 한국 경조사 초대장 링크야.
이 URL의 실제 페이지 내용을 읽고 경조사 정보를 추출해줘.
URL: ${url}
반드시 페이지에서 읽은 실제 데이터만 사용해. 추측하지 마.

다음 JSON 형식으로 반환해:
${OUTPUT_SCHEMA}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION, tools: [{ urlContext: {} }] },
      });
      const data = normalizeData(parseAiResponse(response.text || '{}'));
      const confidence = calculateConfidence(data);

      return NextResponse.json({ success: true, data, confidence, source: 'url-context' });
    } catch (e: any) {
      console.error('[parse-url] Phase 3 error:', e?.message);
      return NextResponse.json(
        { success: false, reason: 'ai_failed', message: 'AI 분석에 실패했습니다.' },
        { status: 500 },
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, reason: 'parse_failed', message: '요청 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
