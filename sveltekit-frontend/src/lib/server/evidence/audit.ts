/**
 * Evidence audit helpers — re-exported from the canonical location.
 *
 * Next_steps plans reference `$lib/server/evidence/audit` (co-located with the
 * evidence domain).  The implementation now lives under the feature barrel at
 * `$lib/server/features/evidence/audit/evidence-audit`.
 */
export {
  logEvidenceAction,
  createEvidenceVersion,
  type EvidenceAction,
} from '$lib/server/features/evidence/audit/evidence-audit.js';
