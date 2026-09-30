import type { MorningCardModel } from '@/lib/desk/assemble';

const MACRO_LABEL: Record<MorningCardModel['macroLabel'], string> = {
  off: 'G7 nonaktif',
  NOT_EVALUATED: 'Makro tidak dievaluasi',
  NEUTRAL: 'Makro netral',
  CAUTION: 'Makro waspadai',
  absent: 'Makro tidak ada',
};

export default function MorningCard({ card }: { card: MorningCardModel }) {
  return (
    <section className="morning-card glass-card">
      <header className="morning-card-header">
        <h2>Kartu Pagi · {card.date}</h2>
        <span className="desk-muted">{MACRO_LABEL[card.macroLabel]}</span>
      </header>
      {card.marketClosed && (
        <p className="desk-muted morning-closed-banner">
          IDX tutup ({card.marketClosed.reason}) · menampilkan sesi{' '}
          <span className="morning-session-date">{card.date}</span>
        </p>
      )}
      {card.universeSource === 'none' && (
        <p className="desk-muted">Watchlist kosong — tidak ada emiten IDX</p>
      )}
      <div className="morning-counts">
        <div className="morning-count enter">
          <strong>{card.enterCount}</strong>
          <span>ENTER</span>
        </div>
        <div className="morning-count wait">
          <strong>{card.waitCount}</strong>
          <span>WAIT</span>
        </div>
        <div className="morning-count avoid">
          <strong>{card.avoidCount}</strong>
          <span>AVOID</span>
        </div>
        <div className="morning-count take">
          <strong>{card.takeProfitCount}</strong>
          <span>TAKE_PROFIT</span>
        </div>
      </div>
      <div className="morning-lists">
        <div>
          <h3>Top ENTER</h3>
          {card.topEnter.length === 0 ? (
            <p className="desk-muted">Tidak ada setup ENTER.</p>
          ) : (
            <ul>
              {card.topEnter.map((row) => (
                <li key={row.emiten}>
                  {row.emiten} · R:R {row.rr === null || !Number.isFinite(row.rr) ? '—' : row.rr.toFixed(2)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Top WAIT</h3>
          {card.topWait.length === 0 ? (
            <p className="desk-muted">Tidak ada WAIT.</p>
          ) : (
            <ul>
              {card.topWait.map((row) => (
                <li key={row.emiten}>
                  {row.emiten} · {row.blockingGate}: {row.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {card.pendingOutcomeCount > 0 && (
        <p className="desk-muted">ENTER belum terskor: {card.pendingOutcomeCount}. Outcome tetap NULL sampai horizon N=5 lengkap.</p>
      )}
      {card.unexplainedCount > 0 && (
        <p className="desk-muted">WAIT/AVOID unexplained: {card.unexplainedCount} — reason gate tidak tersimpan.</p>
      )}
      {card.skipped.length > 0 && (
        <p className="desk-muted">
          Dilewati non-IDX: {card.skipped.map((item) => `${item.symbol} (${item.reason})`).join(', ')}.
        </p>
      )}
    </section>
  );
}
