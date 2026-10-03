import { NextRequest, NextResponse } from 'next/server';
import { calculateExecutionAudit } from '@/lib/risk/audit';
import { saveExecutionAudit } from '@/lib/db';
import { sessionDateJakarta } from '@/lib/market-calendar';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      journalId,
      emiten,
      plannedEntry,
      executedEntry,
      plannedR1,
      invalidationStop,
      lots,
      actualExitPrice,
      exitReason,
      tradeDate,
    } = body;

    if (!emiten || !plannedEntry || !executedEntry || !lots) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required execution fields' },
        { status: 400 }
      );
    }

    const audit = calculateExecutionAudit({
      plannedEntry: Number(plannedEntry),
      executedEntry: Number(executedEntry),
      plannedR1: Number(plannedR1 || executedEntry * 1.05),
      invalidationStop: Number(invalidationStop || executedEntry * 0.95),
      lots: Number(lots),
      actualExitPrice: actualExitPrice ? Number(actualExitPrice) : undefined,
    });

    const dateToRecord = tradeDate || sessionDateJakarta(new Date());
    const allocatedCapital = Number(lots) * 100 * Number(executedEntry);

    const savedRow = await saveExecutionAudit({
      journal_id: journalId ? Number(journalId) : null,
      emiten: String(emiten).toUpperCase(),
      trade_date: dateToRecord,
      planned_entry: Number(plannedEntry),
      executed_entry: Number(executedEntry),
      slippage_ticks: audit.slippageTicks,
      slippage_pct: audit.slippagePct,
      position_size_lots: Number(lots),
      allocated_capital: allocatedCapital,
      actual_exit_price: actualExitPrice ? Number(actualExitPrice) : null,
      realized_pnl: audit.realizedPnl,
      exit_reason: exitReason || null,
    });

    return NextResponse.json({
      status: 'success',
      audit,
      record: savedRow,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
