/**
 * Evidence audit helpers — re-exported from the canonical location.
 *
 * Next_steps plans reference `$lib/server/evidence/audit` (co-located with the
 * evidence domain).  The implementation lives at `$lib/server/audit/evidence-audit`
 * and is the source of truth.  This barrel keeps the path stable without copying code.
 */
export {
  logEvidenceAction,
  createEvidenceVersion,
  type EvidenceAction,
} from '$lib/server/audit/evidence-audit.js';
