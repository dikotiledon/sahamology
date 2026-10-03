import { NextRequest, NextResponse } from 'next/server';
import { getBattlePlanForDate } from '@/lib/db';
import { sessionDateJakarta, jakartaYmd, isWeekend, isIdxHoliday } from '@/lib/market-calendar';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedDate = searchParams.get('date');
    const now = new Date();
    const todayYmd = jakartaYmd(now);
    const planDate = requestedDate || sessionDateJakarta(now);

    const isNonTrading = isWeekend(planDate) || isIdxHoliday(planDate);
    const rows = await getBattlePlanForDate(planDate);

    return NextResponse.json({
      status: 'success',
      planDate,
      isTradingDay: !isNonTrading,
      items: rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
