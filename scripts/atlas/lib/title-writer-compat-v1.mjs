/**
 * TITLE-WRITER-ALIGN-02: read-only compatibility diagnostic for every known title writer/validator.
 * It reads source TEXT only (no DB, no network, no writes, no execution of the audited files) and derives
 * facts from the file contents; the verdict is computed from those facts, never hard-coded per file.
 *
 * Result (exactly one per writer):
 *   COMPATIBLE_READ_ONLY         recognized historical representation; observed only, NO promotion/persistence implied
 *   BLOCKED_FORMAT_OR_DERIVATION invalid/loose shape, shape or version conflicts with the persisted-form policy or
 *                                validators, or a derivation that cannot be reproduced / would change stored labels
 *   BLOCKED_AUTHORITY            correct-looking identity but write path lacks authoritative source/registry/revision
 *                                evidence, or keys the write by the label instead of packet_key
 * A recognized title is never automatically eligible for persistence (`persistenceEligible` is always false here).
 *
 * Rule order (first match wins): format/derivation blocks, then authority blocks, then compatible.
 */
import { TITLE_VERSION_RULES_V1, PERSISTENCE_POLICY_V1 } from './title-identity-contract-v1.mjs';

export const TITLE_WRITER_VERDICTS_V1 = Object.freeze(['COMPATIBLE_READ_ONLY', 'BLOCKED_FORMAT_OR_DERIVATION', 'BLOCKED_AUTHORITY']);

const VERSION_LITERAL = /\b(deterministic-title-v\d+|semantic-title-v\d+)\b/g;

/** Facts extracted from source text only. Each is a regex over the file; absence is reported, not assumed. */
export function extractTitleWriterFactsV1(text) {
  const t = String(text ?? '');
  const versions = [...new Set([...t.matchAll(VERSION_LITERAL)].map((m) => m[1]))].sort();
  return {
    versions,
    emitsTwoPart: /titleId\s*:\s*`title:\$\{suffix\}`/.test(t),
    declaresThreePartRegex: /\^title:\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*:\[a-f0-9\]\{8\}\$/.test(t)
      || /\^title:\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*:\[a-f0-9\]\{8\}\$/.test(t),
    looseThreePartRegex: /\[a-z0-9-\]\{0,64\}/.test(t),
    slugTrimBeforeSlice: /\.replace\(\/\^-\+\|-\+\$\/g,\s*''\)\s*\.slice\(0,\s*64\)/.test(t),
    nonCollapsingSlug: /\.replace\(\/\[\^a-z0-9\]\/g,\s*'-'\)/.test(t),
    excludesNullTitles: /WHERE\s+title_id\s+IS\s+NOT\s+NULL/i.test(t),
    includesNullTitles: /title_id\s+IS\s+NULL/i.test(t),
    // SQL statements only: `UPDATE <table> [alias] SET` / `INSERT INTO` (never `.update(` method calls such as createHash().update()).
    writesDatabase: /\bUPDATE\s+[a-z_][a-z0-9_.]*(?:\s+(?:AS\s+)?[a-z_][a-z0-9_]*)?\s+SET\b/i.test(t) || /\bINSERT\s+INTO\s+[a-z_]/i.test(t),
    // The WHERE title_id predicate must sit inside the same SQL string as the UPDATE (no backtick or semicolon between).
    writeKeyedByTitleId: /UPDATE\s+atlas_packets[^`;]*?WHERE\s+title_id\s*=/i.test(t),
    emitsThreePart: /title:\$\{slug\}:/.test(t),
    importsRegistryVersion: /import\s*\{[^}]*TITLE_GENERATOR_VERSION[^}]*\}\s*from\s*'[^']*packet-registry/.test(t),
    writeKeyedByPacketKey: /WHERE\s+packet_key\s*=|packet_key\s*=\s*ANY|unnest\(\$\d+::text\[\]\)/i.test(t),
    hasSourceBindingEvidence: /source_digest|verifyCachedPacketCandidateSourceSpan|SourceBindingReceipt|source_revision/i.test(t),
    revalidatesAfterRegenerate: /generateTitleIdentity[\s\S]{0,400}CANONICAL_TITLE_RE\.test/.test(t),
    validatesThreePartStrictly: /CANONICAL_TITLE_RE\s*=\s*\/\^title:\[a-z0-9\]\+/.test(t),
    callsGenerateTitleIdentity: /generateTitleIdentity\s*\(/.test(t),
  };
}

/**
 * @param {{id:string, role:'GENERATOR'|'VALIDATOR_DECLARATION'|'BACKFILL'|'PROMOTION'|'LABEL_JOIN_WRITER'|'CONSUMER', file:string}} descriptor
 * @param {string} text
 */
export function diagnoseTitleWriterV1(descriptor, text, options = {}) {
  const facts = extractTitleWriterFactsV1(text);
  if (facts.importsRegistryVersion && options.registryVersion && !facts.versions.includes(options.registryVersion)) {
    facts.versions = [...facts.versions, options.registryVersion].sort();
    facts.versionsIncludeImportedRegistry = true;
  }
  const findings = [];
  const unknownVersions = facts.versions.filter((v) => !TITLE_VERSION_RULES_V1[v]);
  const emittedShapes = new Set(facts.versions.map((v) => TITLE_VERSION_RULES_V1[v]?.shape).filter(Boolean));
  if (facts.emitsTwoPart) emittedShapes.add('TWO_PART');

  // ---- format / derivation blocks
  if (unknownVersions.length) findings.push({ block: 'FORMAT', code: 'VERSION_FORMULA_UNKNOWN', detail: unknownVersions });
  if (facts.looseThreePartRegex) findings.push({ block: 'FORMAT', code: 'LOOSE_VALIDATOR_ACCEPTS_EMPTY_OR_TRAILING_HYPHEN_SLUG' });
  if (facts.nonCollapsingSlug) findings.push({ block: 'FORMAT', code: 'NON_COLLAPSING_SLUG_CAN_PRODUCE_DOUBLE_HYPHEN' });
  if (facts.slugTrimBeforeSlice) {
    // Only a title_id-format defect where the slug is part of the emitted id; elsewhere it is informational.
    findings.push({ block: facts.emitsThreePart || descriptor.role === 'BACKFILL' ? 'FORMAT' : 'INFO',
      code: 'SLUG_TRUNCATION_CAN_LEAVE_TRAILING_HYPHEN' });
  }
  if (descriptor.role !== 'VALIDATOR_DECLARATION' && descriptor.role !== 'CONSUMER'
      && emittedShapes.has('TWO_PART') && PERSISTENCE_POLICY_V1.persistedShape === 'THREE_PART'
      && descriptor.role !== 'GENERATOR') {
    findings.push({ block: 'FORMAT', code: 'TWO_PART_OUTPUT_CONFLICTS_WITH_PERSISTED_THREE_PART_POLICY' });
  }
  if (descriptor.role === 'CONSUMER' && facts.callsGenerateTitleIdentity && facts.validatesThreePartStrictly && !facts.revalidatesAfterRegenerate) {
    findings.push({ block: 'FORMAT', code: 'REGENERATES_TWO_PART_THEN_VALIDATES_THREE_PART_WITHOUT_RECHECK' });
  }
  if (descriptor.role === 'CONSUMER' && facts.callsGenerateTitleIdentity && !facts.validatesThreePartStrictly) {
    findings.push({ block: 'FORMAT', code: 'CONSUMES_TWO_PART_GENERATOR_OUTPUT' });
  }
  if (descriptor.role === 'BACKFILL' && facts.versions.includes('semantic-title-v1')) {
    findings.push({ block: 'FORMAT', code: 'BACKFILL_VERSION_DIFFERS_FROM_STORED_POPULATION_WOULD_CHANGE_SUFFIXES', detail: 'stored rows are deterministic-title-v1' });
  }
  if (descriptor.role === 'BACKFILL' && facts.excludesNullTitles && !facts.includesNullTitles) {
    findings.push({ block: 'FORMAT', code: 'NULL_TITLES_NOT_REPAIRED' });
  }

  // ---- authority blocks
  if (facts.writeKeyedByTitleId) findings.push({ block: 'AUTHORITY', code: 'WRITE_KEYED_BY_TITLE_LABEL_NOT_PACKET_KEY' });
  if (facts.writesDatabase && !facts.hasSourceBindingEvidence) {
    findings.push({ block: 'AUTHORITY', code: 'DB_WRITE_WITHOUT_SOURCE_BINDING_OR_REVISION_EVIDENCE' });
  }

  const formatBlocked = findings.some((f) => f.block === 'FORMAT');
  const authorityBlocked = findings.some((f) => f.block === 'AUTHORITY');
  let verdict = 'COMPATIBLE_READ_ONLY';
  if (formatBlocked) verdict = 'BLOCKED_FORMAT_OR_DERIVATION';
  else if (authorityBlocked) verdict = 'BLOCKED_AUTHORITY';

  // Generator/declaration of a RECOGNIZED shape is read-compatible even though the shapes disagree downstream.
  if ((descriptor.role === 'GENERATOR' || descriptor.role === 'VALIDATOR_DECLARATION') && !unknownVersions.length
      && !facts.looseThreePartRegex && !facts.writesDatabase) verdict = 'COMPATIBLE_READ_ONLY';

  return {
    schema: 'atlas.title-writer-compat.v1',
    id: descriptor.id,
    role: descriptor.role,
    file: descriptor.file,
    verdict,
    findings,
    facts,
    persistenceEligible: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
