import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { corsResponse, withCors } from '@/src/lib/cors';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

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
        contents: {
          parts: [
            { inlineData: { data: b64, mimeType: 'image/jpeg' } },
            { text: '경조사 정보 추출' },
          ],
        },
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
      });
      responseText = r.text ?? '{}';

    } else if (type === 'url') {
      const base = process.env.APP_URL ?? 'http://localhost:3000';
      const res = await fetch(`${base}/api/parse-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data }),
      });
      return withCors(req, NextResponse.json(await res.json()));
    }

    return withCors(req, NextResponse.json({ success: true, data: JSON.parse(responseText) }));

  } catch (e: any) {
    const isRateLimit = e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
    return withCors(req, NextResponse.json(
      { success: false, reason: isRateLimit ? 'rate_limit' : 'parse_error' },
      { status: isRateLimit ? 429 : 500 }
    ));
  }
}
