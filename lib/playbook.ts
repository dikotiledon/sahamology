/**
 * Backward-compatible re-export shim.
 *
 * The Phase 0 playbook evaluator now lives in `lib/playbook/evaluate.ts` with
 * the canonical card types in `lib/playbook/types.ts`. Legacy importers of
 * `@/lib/playbook` (the stock route, DecisionCard, journal payload) keep
 * compiling while they migrate to `PlaybookCard` in Task R3.
 */

export { evaluatePlaybook } from './playbook/evaluate';
export type {
  PlaybookInput,
  PlaybookCard,
  PlaybookCard as PlaybookResult,
  Stance,
  GateId,
  GateResult,
} from './playbook/types';
