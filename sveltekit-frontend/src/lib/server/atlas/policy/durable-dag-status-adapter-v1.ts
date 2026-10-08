/** Read-only compatibility mapping for the existing durable execution journal.
 * No migrations, claims, or state writes. Never use mapping as proof of a lease.
 */
import type { DagAttemptStatusV1 } from './dag-attempt-cas-v1.js';
export type JournalStepStatusV1 = 'PENDING' | 'EXECUTING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
export function journalToAttemptStatusV1(status: JournalStepStatusV1): DagAttemptStatusV1 | null {
 switch(status) {
  case 'PENDING': return null; // pending is not an eligibility or dependency claim
  case 'EXECUTING': return 'RUNNING';
  case 'SUCCESS': return 'SUCCEEDED';
  case 'FAILED': return 'FAILED';
  case 'SKIPPED': return null; // no equivalent: preserve reason and avoid promotion
 }
}
export function attemptToJournalStatusV1(status: DagAttemptStatusV1): JournalStepStatusV1 | null {
 switch(status) {
  case 'READY': return 'PENDING';
  case 'RUNNING': return 'EXECUTING';
  case 'SUCCEEDED': return 'SUCCESS';
  case 'FAILED': return 'FAILED';
  case 'SUPERSEDED': return null; // new attempt generation / immutable event required
 }
}
export type JournalClaimCapabilityV1 = Readonly<{
  schemaDeployed: boolean;
  leaseOwnershipVerified: boolean;
  fencingGenerationVerified: boolean;
  transactionalReceiptVerified: boolean;
  dependencyClaimVerified: boolean;
}>;
export function canActivateJournalDagClaimsV1(_claims: JournalClaimCapabilityV1): false {
 return false;
}
