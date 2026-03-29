import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('date', tomorrowStr);

    if (!entries || entries.length === 0) {
      return NextResponse.json({ message: 'No events for tomorrow' });
    }

    return NextResponse.json({ message: `Found ${entries.length} events for tomorrow` });
  } catch (error: any) {
    console.error('Cron notify failed:', error);
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
  }
}
