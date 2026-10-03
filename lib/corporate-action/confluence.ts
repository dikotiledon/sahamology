import {
  DividendMetrics,
  RightsIssueMetrics,
  CorpActionRegime,
  ActionType,
} from './types';

export interface CorpActionConfluenceInput {
  currentPrice: number;
  tradeDate: string;
  primaryActionType: ActionType;
  dividend: DividendMetrics;
  rightsIssue?: RightsIssueMetrics | null;
}

export interface CorpActionConfluenceResult {
  regime: CorpActionRegime;
  score: number;
  advisory: string;
}

/**
 * Evaluates the corporate action regime, conviction score, and tactical advisory
 * based on dividend trap metrics, pre-cum run-up windows, and rights issue dilution parameters.
 */
export function evaluateCorpActionConfluence(
  input: CorpActionConfluenceInput
): CorpActionConfluenceResult {
  const { primaryActionType, dividend, rightsIssue } = input;

  // 1. Unsecured Rights Dilution Risk
  if (
    primaryActionType === 'RIGHTS_ISSUE' &&
    rightsIssue &&
    (!rightsIssue.hasStandbyBuyer || (rightsIssue.dilutionPct ?? 0) > 35)
  ) {
    return {
      regime: 'UNSECURED_RIGHTS_DILUTION_RISK',
      score: 20,
      advisory: `Peringatan Risiko Dilusi Ekstrem: Rights Issue (HMETD) dengan potensi dilusi ${rightsIssue.dilutionPct}% ${
        !rightsIssue.hasStandbyBuyer ? 'tanpa kepastian Pembeli Siaga (Standby Buyer)' : ''
      }. Risiko penurunan harga mendekati atau menembus harga tebus (Rp ${rightsIssue.exercisePrice}).`,
    };
  }

  // 2. Pre-Cum Dividend Run-Up Expansion
  if (dividend.isPreCumRunUpEligible && dividend.daysToCum !== null) {
    return {
      regime: 'PRE_CUM_RUNUP_EXPANSION',
      score: 90,
      advisory: `Peluang Pre-Cum Dividend Run-Up: Sisa ${dividend.daysToCum} sesi menuju Cum Date dengan estimasi yield ${dividend.dividendYieldPct}% (DPS: Rp ${dividend.dividendAmount}). Strategi panen momentum apresiasi harga sebelum Cum Date untuk menghindari gap Ex-Date & pajak dividen 10%.`,
    };
  }

  // 3. Dividend Trap Hazard
  if (
    dividend.dividendAmount > 0 &&
    (dividend.dividendTrapScore >= 65 ||
      (dividend.daysToCum !== null && dividend.daysToCum <= 1 && dividend.dividendYieldPct >= 5.0))
  ) {
    return {
      regime: 'DIVIDEND_TRAP_HAZARD',
      score: 30,
      advisory: `Peringatan Dividend Trap Ekstrem (Skor Risiko: ${dividend.dividendTrapScore}/100): Estimasi yield ${dividend.dividendYieldPct}% dengan rasio penurunan historis Ex-Date ${dividend.historicalExDropRatio}x DPS. Risiko tinggi menahan posisi melewati Ex-Date.`,
    };
  }

  // 4. Rights Issue Standby Secured
  if (
    primaryActionType === 'RIGHTS_ISSUE' &&
    rightsIssue &&
    rightsIssue.hasStandbyBuyer &&
    (rightsIssue.dilutionPct ?? 0) <= 35
  ) {
    return {
      regime: 'RIGHTS_ISSUE_STANDBY_SECURED',
      score: 65,
      advisory: `Rights Issue Terjamin: Pembeli Siaga kredibel (${rightsIssue.standbyBuyer}) dengan dilusi terukur ${rightsIssue.dilutionPct}% dan harga teoritis Rp ${rightsIssue.theoreticalPrice}.`,
    };
  }

  // 5. Post-Ex Absorption Bounce
  if (
    dividend.exDate &&
    dividend.daysToCum !== null &&
    dividend.daysToCum < 0 &&
    dividend.daysToCum >= -3
  ) {
    return {
      regime: 'POST_EX_ABSORPTION_BOUNCE',
      score: 80,
      advisory: `Fase Post-Ex Absorption: Saham telah melewati Ex-Date (${Math.abs(
        dividend.daysToCum
      )} sesi yang lalu). Tekanan jual awal Ex-Date mulai mereda; pantau absorpsi akumulasi institusi di level support.`,
    };
  }

  // 6. Neutral Corporate Action
  return {
    regime: 'NEUTRAL_CORPORATE_ACTION',
    score: 50,
    advisory: `Tidak terdeteksi aksi korporasi dividen atau rights issue berisiko tinggi dalam horizon 20 sesi bursa.`,
  };
}
