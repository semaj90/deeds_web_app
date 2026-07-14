/**
 * qdrant-parity-contract.mjs
 *
 * Compatibility wrapper for the shared Qdrant parity core.
 * Keep existing import paths stable while the canonical logic lives in
 * qdrant-parity-repair-core.mjs.
 */

export {
  COLLECTION_CONTRACTS,
  resolveSampleConfiguration,
  resolveSample,
  resolveCollectionConfiguration,
  validateVectorContract,
  classifyParity,
  buildCanonicalPayload,
  generateRepairEvents,
  applyPayloadRepair,
  computeOverallStatus,
  outboxEventId,
  outboxId,
} from './qdrant-parity-repair-core.mjs';
