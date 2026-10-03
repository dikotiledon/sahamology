import { getIdxTickSize } from '@/lib/risk/sizer';
import type { VolumeProfileResult } from './types';

export type VolumeProfileConfluenceStatus =
  | 'AT_POC_SUPPORT'
  | 'INSIDE_VALUE_AREA'
  | 'ABOVE_VALUE_AREA'
  | 'BELOW_VALUE_AREA'
  | 'IN_LOW_VOLUME_VOID';

export interface VolumeProfileConfluence {
  status: VolumeProfileConfluenceStatus;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  pocDistancePct: number;
  isEntryAtHvnShelf: boolean;
  isEntryInLvnVoid: boolean;
  summary: string;
  tags: string[];
}

export function evaluateVolumeProfileConfluence(params: {
  profile: VolumeProfileResult;
  plannedEntry: number;
  plannedR1?: number;
  invalidationStop?: number;
}): VolumeProfileConfluence {
  const { profile, plannedEntry } = params;

  if (!profile || profile.totalVolume <= 0 || profile.pocPrice <= 0) {
    return {
      status: 'INSIDE_VALUE_AREA',
      pocPrice: 0,
      vahPrice: 0,
      valPrice: 0,
      pocDistancePct: 0,
      isEntryAtHvnShelf: false,
      isEntryInLvnVoid: false,
      summary: 'Data profil volume tidak mencukupi untuk evaluasi likuiditas.',
      tags: ['INSUFFICIENT_VOLUME_DATA'],
    };
  }

  const { pocPrice, vahPrice, valPrice, hvnShelves, lvnVoids } = profile;
  const tickSize = getIdxTickSize(plannedEntry);

  const pocDistancePct = Number((((plannedEntry - pocPrice) / pocPrice) * 100).toFixed(2));

  const isEntryAtPoc = Math.abs(plannedEntry - pocPrice) <= 2 * tickSize;
  const isEntryAtHvnShelf =
    isEntryAtPoc || hvnShelves.some((shelf) => Math.abs(plannedEntry - shelf) <= tickSize);
  const isEntryInLvnVoid =
    !isEntryAtPoc && lvnVoids.some((voidPrice) => Math.abs(plannedEntry - voidPrice) <= tickSize);

  let status: VolumeProfileConfluenceStatus;
  let summary: string;
  const tags: string[] = [];

  if (isEntryInLvnVoid) {
    status = 'IN_LOW_VOLUME_VOID';
    summary = `Peringatan: Entry Rp ${plannedEntry.toLocaleString('id-ID')} berada di Low Volume Void (LVN). Risiko slippage tinggi karena tipisnya bantalan likuiditas.`;
    tags.push('LOW_VOLUME_VOID', 'SLIPPAGE_RISK');
  } else if (isEntryAtPoc) {
    status = 'AT_POC_SUPPORT';
    summary = `Entry Rp ${plannedEntry.toLocaleString('id-ID')} didukung tepat oleh Point of Control (POC Rp ${pocPrice.toLocaleString('id-ID')}), area konsensus likuiditas institusional terkuat.`;
    tags.push('POC_SUPPORT', 'MAX_INSTITUTIONAL_LIQUIDITY');
  } else if (plannedEntry > vahPrice) {
    status = 'ABOVE_VALUE_AREA';
    summary = `Entry Rp ${plannedEntry.toLocaleString('id-ID')} berada di atas Value Area High (VAH Rp ${vahPrice.toLocaleString('id-ID')}), menandakan ekspansi breakout di luar batas konsensus 70%.`;
    tags.push('ABOVE_VAH', 'AUCTION_EXPANSION');
  } else if (plannedEntry < valPrice) {
    status = 'BELOW_VALUE_AREA';
    summary = `Entry Rp ${plannedEntry.toLocaleString('id-ID')} berada di bawah Value Area Low (VAL Rp ${valPrice.toLocaleString('id-ID')}), area diskon likuiditas institusional.`;
    tags.push('BELOW_VAL', 'VALUE_DISCOUNT');
  } else {
    status = 'INSIDE_VALUE_AREA';
    summary = `Entry Rp ${plannedEntry.toLocaleString('id-ID')} berada di dalam Value Area (Rp ${valPrice.toLocaleString('id-ID')} – Rp ${vahPrice.toLocaleString('id-ID')}), zona harga wajar institusi.`;
    tags.push('INSIDE_VALUE_AREA', 'FAIR_VALUE_ZONE');
  }

  if (isEntryAtHvnShelf && !isEntryAtPoc) {
    tags.push('HVN_SHELF_SUPPORT');
  }

  return {
    status,
    pocPrice,
    vahPrice,
    valPrice,
    pocDistancePct,
    isEntryAtHvnShelf,
    isEntryInLvnVoid,
    summary,
    tags,
  };
}
