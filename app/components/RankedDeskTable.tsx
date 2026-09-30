import { visibleDeskRows, type DeskRow } from '@/lib/desk/assemble';

const STANCE_LABEL: Record<string, string> = {
  ENTER: 'Masuk',
  WAIT: 'Tunggu',
  AVOID: 'Hindari',
  TAKE_PROFIT: 'Ambil Profit',
  INVALIDATED: 'Batal',
};

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID');
}

export default function RankedDeskTable({
  rows,
  showAvoid = false,
}: {
  rows: DeskRow[];
  showAvoid?: boolean;
}) {
  const visible = visibleDeskRows(rows, showAvoid);
  if (visible.length === 0) {
    return (
      <p className="desk-muted">
        {rows.some((row) => row.stance === 'AVOID') && !showAvoid
          ? 'AVOID disembunyikan. Nyalakan toggle untuk menampilkan.'
          : 'Tidak ada baris jurnal untuk tanggal ini.'}
      </p>
    );
  }

  return (
    <div className="desk-table-wrap">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Emiten</th>
            <th>Stance</th>
            <th>R:R</th>
            <th>Entry</th>
            <th>Invalidasi</th>
            <th>Aksi berikutnya</th>
            <th>Gate tertahan</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={`${row.emiten}-${row.asOf}`} className={row.unexplained ? 'desk-row-unexplained' : undefined}>
              <td>{row.emiten}</td>
              <td>{STANCE_LABEL[row.stance] ?? row.stance}</td>
              <td>{row.rr === null || !Number.isFinite(row.rr) ? '—' : row.rr.toFixed(2)}</td>
              <td>{fmt(row.entry)}</td>
              <td>{fmt(row.invalidation)}</td>
              <td>{row.nextAction.text}</td>
              <td>
                {row.unexplained && <div className="desk-unexplained">unexplained</div>}
                {row.explanations.length === 0 ? (
                  <span className="desk-muted">—</span>
                ) : (
                  <details className="desk-reasons-details">
                    <summary>
                      {row.explanations.length} gate tertahan
                    </summary>
                    <ul className="desk-reasons">
                      {row.explanations.map((item) => (
                        <li key={`${row.emiten}-${item.gateId}`}>
                          <strong>{item.gateId}</strong> {item.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
              <td>
                {row.outcome ?? '—'}
                {row.rMultiple !== null && Number.isFinite(row.rMultiple)
                  ? ` (${row.rMultiple.toFixed(2)}R)`
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
