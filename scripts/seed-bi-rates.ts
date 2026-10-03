/**
 * Seed script for Bank Indonesia (BI-Rate) RDG policy decisions.
 *
 * Usage:
 *   npx tsx scripts/seed-bi-rates.ts
 */

import { saveBiRateDecision } from '../lib/db';

export const HISTORICAL_BI_DECISIONS: Array<{
  meeting_date: string;
  rate: number;
  previous_rate: number;
  action: 'HOLD' | 'HIKE' | 'CUT';
  governor_statement: string;
}> = [
  {
    meeting_date: '2026-01-21',
    rate: 6.0,
    previous_rate: 6.0,
    action: 'HOLD',
    governor_statement: 'BI-Rate dipertahankan pada 6,00% untuk menjaga stabilitas nilai tukar Rupiah.',
  },
  {
    meeting_date: '2026-02-18',
    rate: 6.0,
    previous_rate: 6.0,
    action: 'HOLD',
    governor_statement: 'Kebijakan moneter tetap diarahkan pro-stability dan mendukung pertumbuhan ekonomi.',
  },
  {
    meeting_date: '2026-03-18',
    rate: 6.0,
    previous_rate: 6.0,
    action: 'HOLD',
    governor_statement: 'Stabilitas moneter dan inflasi tetap terkendali dalam sasaran 2,5±1%.',
  },
  {
    meeting_date: '2026-04-22',
    rate: 6.25,
    previous_rate: 6.0,
    action: 'HIKE',
    governor_statement: 'Kenaikan suku bunga untuk memperkuat stabilitas nilai tukar Rupiah dari dampak memburuknya risiko geopolitik global.',
  },
  {
    meeting_date: '2026-05-20',
    rate: 6.25,
    previous_rate: 6.25,
    action: 'HOLD',
    governor_statement: 'Keputusan ini konsisten dengan fokus kebijakan moneter yang pro-stability.',
  },
  {
    meeting_date: '2026-06-17',
    rate: 6.25,
    previous_rate: 6.25,
    action: 'HOLD',
    governor_statement: 'Stabilitas eksternal dan aliran modal asing terjaga di tengah ketidakpastian global.',
  },
  {
    meeting_date: '2026-07-22',
    rate: 6.25,
    previous_rate: 6.25,
    action: 'HOLD',
    governor_statement: 'Mempertahankan BI-Rate pada level 6,25% guna mengantisipasi volatilitas yield obligasi global.',
  },
  {
    meeting_date: '2026-08-19',
    rate: 6.25,
    previous_rate: 6.25,
    action: 'HOLD',
    governor_statement: 'Inflasi inti terjaga rendah, stabilitas Rupiah terus membaik.',
  },
  {
    meeting_date: '2026-09-17',
    rate: 6.0,
    previous_rate: 6.25,
    action: 'CUT',
    governor_statement: 'Penurunan suku bunga acuan 25 bps sejalan dengan proyeksi inflasi yang tetap rendah dan penguatan nilai tukar Rupiah.',
  },
  {
    meeting_date: '2026-10-01',
    rate: 6.0,
    previous_rate: 6.0,
    action: 'HOLD',
    governor_statement: 'BI-Rate dipertahankan 6,00% untuk menjaga momentum aliran modal masuk ke pasar keuangan domestik.',
  },
];

export async function seedBiRates() {
  console.log(`[Seed BI-Rate] Seeding ${HISTORICAL_BI_DECISIONS.length} RDG decisions...`);
  for (const decision of HISTORICAL_BI_DECISIONS) {
    await saveBiRateDecision(decision);
    console.log(`  ✓ ${decision.meeting_date}: ${decision.rate}% (${decision.action})`);
  }
  console.log('[Seed BI-Rate] Complete.');
}

if (process.argv[1]?.endsWith('seed-bi-rates.ts')) {
  seedBiRates().catch((err) => {
    console.error('[Seed BI-Rate] Failed:', err);
    process.exit(1);
  });
}
