# Terminologi Sahamology

Halaman ini menetapkan istilah kanonik (istilah baku) yang dipakai di kode sumber Sahamology. Istilah-istilah ini diputuskan lewat terminologi-alignment refactor dengan keputusan **D1=1a, D2=2a, D3=3a, D4=4a**.

## 1. Bandar (spesifik) vs Kategori Broker

| Konteks | Istilah kanonik | Keterangan |
|---|---|---|
| Broker akumulator teratas pada formula Adi Sucipto | `bandar` | Dipakai di `BrokerData.bandar`, `barangBandar`, `rataRataBandar`. Ini broker **spesifik**, bukan kategori. |
| Kategori broker internal | `Smartmoney` | Kategori yang sebelumnya rancu dengan "bandar". Lihat tabel di bawah. |
| Label kolom PDF untuk broker spesifik | `Bandar` | Dipertahankan sebagai header kolom (`lib/pdfExport.ts`) — ini label, bukan nilai kategori. |

## 2. Kategori Broker (`BrokerType` / `broker_status`)

Union kanonik:

```ts
type BrokerType = 'Smartmoney' | 'Whale' | 'Retail' | 'Mix';
```

| Nilai internal | Label UI (Indonesia) |
|---|---|
| `Smartmoney` | Smart Money / Bandar |
| `Whale` | Whale |
| `Retail` | Retail |
| `Mix` | Mix |

Aturan penting:

- **`Unknown` tidak ada lagi** di union `BrokerType` maupun `broker_status`. Kode broker yang tidak terdaftar **dilipat langsung ke `Mix`** di batas lookup `getBrokerInfo` (`lib/brokers.ts`):

  ```ts
  return BROKERS[code.toUpperCase()] || { code, name: "Unknown Broker", type: "Mix" };
  ```

- Label badge CSS memakai kelas `smartmoney`, `whale`, `retail`, `mix` (`app/globals.css`). Kelas `.bandar` dan `.unknown` sudah dihapus.

## 3. ARA / ARB (Auto Reject)

| Istilah kanonik (internal) | Nama lama (dihapus) | Label UI |
|---|---|---|
| `ara` | `offerTeratas` | "ARA (Offer Teratas)" / "Offer Max" |
| `arb` | `bidTerbawah` | "ARB (Bid Terbawah)" / "Bid Min" |

Antarmuka `MarketData` (`lib/types.ts`):

```ts
export interface MarketData {
  harga: number;
  ara: number;
  arb: number;
  fraksi: number;
  totalBid: number;
  totalOffer: number;
}
```

Catatan: `ara` / `arb` menyimpan batas Auto Reject Atas / Bawah, bukan harga bid/offer terbaik di orderbook. Nama lama (`offerTeratas`/`bidTerbawah`) membuatnya rancu dengan top-of-book, sehingga diganti.

## 4. Sumber di Kode

| Istilah | Lokasi |
|---|---|
| `MarketData.ara` / `.arb` | `lib/types.ts`, `app/api/stock/route.ts`, `lib/jobs/run-watchlist-analysis.ts` |
| `broker_status` union | `lib/types.ts`, `lib/broker-flow-transform.ts`, `app/api/broker-flow/route.ts` |
| `getBrokerInfo` fold ke `Mix` | `lib/brokers.ts` |
| Label UI filter broker | `app/components/BrokerFlowCard.tsx` |
| Label ARA/ARB | `app/components/ResultTable.tsx`, `app/components/CompactResultCard.tsx` |
