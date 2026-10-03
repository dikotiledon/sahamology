import { getIdxTickSize } from '@/lib/risk/sizer';
import type { PriceBar, VolumeBin, VolumeProfileResult } from './types';

export function calculateVolumeProfile(params: {
  emiten: string;
  bars: PriceBar[];
  lookbackDays?: number;
}): VolumeProfileResult {
  const { emiten, bars, lookbackDays = 20 } = params;

  if (!bars || bars.length < 5) {
    return {
      emiten,
      asOfDate: bars && bars.length > 0 ? bars[bars.length - 1].date : '',
      lookbackDays,
      totalVolume: 0,
      pocPrice: 0,
      vahPrice: 0,
      valPrice: 0,
      valueAreaVolumePct: 0,
      bins: [],
      hvnShelves: [],
      lvnVoids: [],
    };
  }

  const windowBars = bars.slice(-lookbackDays);
  const asOfDate = windowBars[windowBars.length - 1].date;

  // Step 1: Discretize volume by price across IDX Fraksi ticks
  const volumeByPrice = new Map<number, number>();
  let totalVolume = 0;

  for (const bar of windowBars) {
    if (bar.volume <= 0 || bar.low <= 0 || bar.high < bar.low) continue;

    const ticks: number[] = [];
    let curr = Math.round(bar.low);
    const maxHigh = Math.round(bar.high);

    while (curr <= maxHigh) {
      ticks.push(curr);
      const step = getIdxTickSize(curr);
      curr += step;
      if (ticks.length > 2000) break; // safety guard
    }

    if (ticks.length === 0) continue;

    const volumePerTick = bar.volume / ticks.length;
    for (const tick of ticks) {
      const prev = volumeByPrice.get(tick) || 0;
      volumeByPrice.set(tick, prev + volumePerTick);
      totalVolume += volumePerTick;
    }
  }

  if (totalVolume <= 0 || volumeByPrice.size === 0) {
    return {
      emiten,
      asOfDate,
      lookbackDays,
      totalVolume: 0,
      pocPrice: 0,
      vahPrice: 0,
      valPrice: 0,
      valueAreaVolumePct: 0,
      bins: [],
      hvnShelves: [],
      lvnVoids: [],
    };
  }

  // Step 2: Sort price levels ascending
  const sortedPrices = Array.from(volumeByPrice.keys()).sort((a, b) => a - b);

  // Step 3: Find Point of Control (POC)
  let maxVol = -1;
  let pocPrice = sortedPrices[0];
  let pocIndex = 0;

  for (let i = 0; i < sortedPrices.length; i++) {
    const price = sortedPrices[i];
    const vol = volumeByPrice.get(price) || 0;
    if (vol > maxVol) {
      maxVol = vol;
      pocPrice = price;
      pocIndex = i;
    }
  }

  // Step 4: Calculate 70% Value Area (VAH and VAL) enclosing POC
  const targetVaVolume = 0.70 * totalVolume;
  let currentVaVolume = maxVol;
  let upIndex = pocIndex;
  let downIndex = pocIndex;

  const vaIndices = new Set<number>([pocIndex]);

  while (currentVaVolume < targetVaVolume && (upIndex < sortedPrices.length - 1 || downIndex > 0)) {
    // Look 2 steps above
    let volAbove = 0;
    if (upIndex + 1 < sortedPrices.length) volAbove += volumeByPrice.get(sortedPrices[upIndex + 1]) || 0;
    if (upIndex + 2 < sortedPrices.length) volAbove += volumeByPrice.get(sortedPrices[upIndex + 2]) || 0;

    // Look 2 steps below
    let volBelow = 0;
    if (downIndex - 1 >= 0) volBelow += volumeByPrice.get(sortedPrices[downIndex - 1]) || 0;
    if (downIndex - 2 >= 0) volBelow += volumeByPrice.get(sortedPrices[downIndex - 2]) || 0;

    if (upIndex + 1 >= sortedPrices.length) {
      // Must expand down
      downIndex--;
      vaIndices.add(downIndex);
      currentVaVolume += volumeByPrice.get(sortedPrices[downIndex]) || 0;
    } else if (downIndex - 1 < 0) {
      // Must expand up
      upIndex++;
      vaIndices.add(upIndex);
      currentVaVolume += volumeByPrice.get(sortedPrices[upIndex]) || 0;
    } else if (volAbove >= volBelow) {
      upIndex++;
      vaIndices.add(upIndex);
      currentVaVolume += volumeByPrice.get(sortedPrices[upIndex]) || 0;
    } else {
      downIndex--;
      vaIndices.add(downIndex);
      currentVaVolume += volumeByPrice.get(sortedPrices[downIndex]) || 0;
    }
  }

  const vahPrice = sortedPrices[upIndex];
  const valPrice = sortedPrices[downIndex];
  const valueAreaVolumePct = Math.round((currentVaVolume / totalVolume) * 100);

  // Step 5: Identify High Volume Nodes (HVN) and Low Volume Voids (LVN)
  const hvnShelves: number[] = [];
  const lvnVoids: number[] = [];

  const volumes = sortedPrices.map((p) => volumeByPrice.get(p) || 0);

  const isHvnList: boolean[] = new Array(sortedPrices.length).fill(false);
  const isLvnList: boolean[] = new Array(sortedPrices.length).fill(false);

  for (let i = 0; i < sortedPrices.length; i++) {
    // 5-bin local window average
    const start = Math.max(0, i - 2);
    const end = Math.min(sortedPrices.length - 1, i + 2);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += volumes[j];
      count++;
    }
    const localSma = count > 0 ? sum / count : volumes[i];

    if (volumes[i] >= 1.4 * localSma && volumes[i] > totalVolume * 0.02) {
      isHvnList[i] = true;
      hvnShelves.push(sortedPrices[i]);
    } else if (volumes[i] <= 0.6 * localSma && volumes[i] < totalVolume * 0.015) {
      isLvnList[i] = true;
      lvnVoids.push(sortedPrices[i]);
    }
  }

  // Step 6: Construct structured VolumeBin list
  const bins: VolumeBin[] = sortedPrices.map((price, idx) => {
    const volume = volumeByPrice.get(price) || 0;
    return {
      price,
      volume: Math.round(volume),
      volumePct: Number(((volume / totalVolume) * 100).toFixed(2)),
      isPoc: price === pocPrice,
      isValueArea: vaIndices.has(idx),
      isHvn: isHvnList[idx],
      isLvn: isLvnList[idx],
    };
  });

  return {
    emiten,
    asOfDate,
    lookbackDays,
    totalVolume: Math.round(totalVolume),
    pocPrice,
    vahPrice,
    valPrice,
    valueAreaVolumePct,
    bins,
    hvnShelves,
    lvnVoids,
  };
}
