export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumeBin {
  price: number;
  volume: number;
  volumePct: number;
  isPoc: boolean;
  isValueArea: boolean;
  isHvn: boolean;
  isLvn: boolean;
}

export interface VolumeProfileResult {
  emiten: string;
  asOfDate: string;
  lookbackDays: number;
  totalVolume: number;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  valueAreaVolumePct: number;
  bins: VolumeBin[];
  hvnShelves: number[];
  lvnVoids: number[];
}
