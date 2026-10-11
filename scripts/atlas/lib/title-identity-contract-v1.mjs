/**
 * TITLE-VALIDATOR-ALIGN-01 (scripts-first, PROVISIONAL): one version-aware title contract that keeps three
 * concerns separate. Pure and read-only: no SQL, no writes, no identity authority. title_id is a LABEL;
 * packet_key (+ revisions) is identity.
 *
 *  1. FORMAT       - is the value one of the recognized historical shapes?        classifyTitleFormatV1
 *  2. DERIVATION   - does the suffix equal the hash the recorded generator version  verifyTitleDerivationV1
 *                    would produce for this packet_key?
 *  3. PERSISTENCE  - may this form be WRITTEN today?                               decideTitlePersistenceV1
 *
 * A valid-looking title_id is not necessarily correctly derived: FORMAT says nothing about DERIVATION.
 *
 * Version -> hash-input table (evidence classes):
 *   deterministic-title-v1  hash input "deterministic-title-v1"      SOURCE+OBSERVED (575/576 live sample; scripts/phase-1-title-id-backfill.mjs)
 *   deterministic-title-v2  hash input "deterministic-title-v1"      OBSERVED ONLY (41/41 live sample); no source found in git, formula for the
 *                                                                    slug/label part is UNKNOWN -- hash reproduction is not a claim about the generator
 *   semantic-title-v2       hash input "semantic-title-v2", 2-part   SOURCE (sveltekit-frontend/src/lib/server/ace/title-id-generator.ts)
 *   semantic-title-v1       hash input "semantic-title-v1", 3-part   SOURCE (packages/atlas/lib/packet-registry.mjs + scripts/atlas/backfill-title-identity.mjs); 0 stored rows (live)
 *   v1, anything else                                                UNKNOWN -> never reported as reproduced
 *
 * PERSISTENCE_POLICY_V1 is PROVISIONAL and mirrors the operator-reviewed recommendation to keep the 3-part form
 * for persisted atlas_packets.title_id; TITLE-FORMAT-DECISION-01 (operator) is still open.
 */
import { createHash } from 'node:crypto';

export const TITLE_THREE_PART_V1 = /^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$/;
export const TITLE_TWO_PART_V1 = /^title:[a-f0-9]{8}$/;

export const TITLE_VERSION_RULES_V1 = Object.freeze({
  'deterministic-title-v1': { hashInput: 'deterministic-title-v1', shape: 'THREE_PART', evidence: 'SOURCE_AND_OBSERVED' },
  'deterministic-title-v2': { hashInput: 'deterministic-title-v1', shape: 'THREE_PART', evidence: 'OBSERVED_ONLY' },
  'semantic-title-v1': { hashInput: 'semantic-title-v1', shape: 'THREE_PART', evidence: 'SOURCE_NO_STORED_ROWS' },
  'semantic-title-v2': { hashInput: 'semantic-title-v2', shape: 'TWO_PART', evidence: 'SOURCE' },
});

export const PERSISTENCE_POLICY_V1 = Object.freeze({
  status: 'PROVISIONAL_PENDING_TITLE_FORMAT_DECISION_01',
  persistedShape: 'THREE_PART',
  requireReproducedDerivation: true,
});

export function classifyTitleFormatV1(titleId) {
  if (typeof titleId !== 'string' || titleId.length === 0) return 'MISSING';
  if (TITLE_THREE_PART_V1.test(titleId)) return 'THREE_PART';
  if (TITLE_TWO_PART_V1.test(titleId)) return 'TWO_PART';
  return 'UNRECOGNIZED';
}

const hash8 = (packetKey, hashInput) => createHash('sha256').update(`${packetKey}\0${hashInput}`, 'utf8').digest('hex').slice(0, 8);
const suffixOf = (titleId) => titleId.slice(titleId.lastIndexOf(':') + 1);

export function verifyTitleDerivationV1({ packetKey, titleId, generatorVersion }) {
  const format = classifyTitleFormatV1(titleId);
  const base = { schema: 'atlas.title-derivation-check.v1', format, generatorVersion: generatorVersion ?? null, canonicalAuthority: false, writesPerformed: false };
  if (typeof packetKey !== 'string' || packetKey.trim() === '') return { ...base, status: 'PACKET_KEY_REQUIRED' };
  if (format === 'MISSING' || format === 'UNRECOGNIZED') return { ...base, status: 'FORMAT_UNRECOGNIZED' };
  const rule = TITLE_VERSION_RULES_V1[generatorVersion];
  if (!rule) return { ...base, status: 'FORMULA_UNKNOWN_FOR_VERSION' };
  if (rule.shape !== format) return { ...base, status: 'SHAPE_DIFFERS_FROM_VERSION_RULE', expectedShape: rule.shape };
  const expected = hash8(packetKey, rule.hashInput);
  const matches = expected === suffixOf(titleId);
  return { ...base, status: matches ? 'DERIVATION_REPRODUCED' : 'DERIVATION_MISMATCH', evidence: rule.evidence, expectedSuffix: expected };
}

/** May this title be written today? Format AND reproduced derivation AND policy shape. */
export function decideTitlePersistenceV1({ packetKey, titleId, generatorVersion }, policy = PERSISTENCE_POLICY_V1) {
  const check = verifyTitleDerivationV1({ packetKey, titleId, generatorVersion });
  const out = { schema: 'atlas.title-persistence-decision.v1', policy: policy.status, check, writesPerformed: false, canonicalAuthority: false, productionWriteAuthorized: false };
  if (check.format !== policy.persistedShape) {
    return { ...out, allowed: false, reason: check.format === 'TWO_PART' ? 'TWO_PART_NOT_PERSISTABLE_UNDER_POLICY' : 'FORMAT_NOT_PERSISTABLE' };
  }
  if (policy.requireReproducedDerivation && check.status !== 'DERIVATION_REPRODUCED') {
    return { ...out, allowed: false, reason: check.status };
  }
  if (check.evidence === 'OBSERVED_ONLY') {
    return { ...out, allowed: false, reason: 'GENERATOR_EVIDENCE_OBSERVED_ONLY' };
  }
  return { ...out, allowed: true, reason: 'POLICY_ALLOWS_SHAPE_ONLY', productionWriteAuthorized: false };
}
