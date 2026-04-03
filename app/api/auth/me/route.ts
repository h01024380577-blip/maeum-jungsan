import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const userId = req.cookies.get('toss_user_id')?.value;
  if (!userId) return NextResponse.json({ userId: null }, { status: 401 });
  return NextResponse.json({ userId });
}
