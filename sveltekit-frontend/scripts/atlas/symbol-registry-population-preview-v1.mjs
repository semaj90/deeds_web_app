#!/usr/bin/env node
// SYMBOL-REGISTRY-POPULATION-PREVIEW-01. READ-ONLY. Zero writes anywhere.
//
// Freezes the population contract + a bounded canary preview for creating current, revision-
// qualified SymbolIdentityV1/SymbolVersionV1 rows -- does NOT insert anything. Reuses
// classifyObservation() (SYMBOL-PROMOTED-UNKNOWN-01) and adds a pure admission-policy layer
// (symbol-population-policy.mjs). "13,502 observations" is NOT "13,502 rows to insert" -- the
// promotion policy determines the real eligible count.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { buildObservationsForFile, sourceRevisionForFile } from './lib/symbol-wire-observation-runner.mjs';
import { classifyObservation } from './lib/symbol-promoted-unknown-classifier.mjs';
import { classifyPopulationAction, KIND_POLICY } from './lib/symbol-population-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CORPUS_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-corpus-v1.json');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-registry-population-preview-v1.json');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const KNOWN_REGISTERED_FILES = [
  'src/lib/server/ace/llm-context-cache.ts',
  'src/lib/server/services/error-analysis/CacheService.ts',
  'src/lib/server/services/error-analysis/DecisionEngine.ts',
  'src/lib/server/services/error-analysis/ErrorClustering.ts',
  'src/lib/server/services/error-analysis/EscalationService.ts',
  'src/lib/server/services/error-analysis/FixSynthesizer.ts',
];
// S01-08K-FREEZE (commit f8bcf9e0db, 2026-09-21): stable-file population manifest is FROZEN
// READY, NOT applied -- explicitly awaiting the token "apply S01-08K stable file population".
// Verified via git log, not assumed. Until applied, no current-run observation can be given a
// proven StableFileIdentityV1 binding.
const UPSTREAM_FILE_IDENTITY_RESOLVED = false;
const UPSTREAM_FILE_IDENTITY_EVIDENCE = 'S01-08K-FREEZE (commit f8bcf9e0db, 2026-09-21): manifest frozen READY (24,456 SAFE_NEW_ID / 1,086 REPOSITORY_NAMESPACE_MISSING), zero DB writes, awaiting explicit apply token. Verified via git log this gate, not re-derived.';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

  // --- 1. Independent live counts (per review: do not reuse a mislabeled prior count) --------
  const censusRows = (await pool.query(`
    SELECT
      (SELECT count(*) FROM atlas_symbol_registry) AS symbol_registry_rows,
      (SELECT count(*) FROM atlas_symbol_versions) AS symbol_version_rows,
      (SELECT count(DISTINCT source_ref) FROM atlas_symbol_versions) AS distinct_source_refs,
      (SELECT count(*) FROM atlas_symbol_versions WHERE source_revision LIKE 'sha256:%') AS real_revision_rows,
      (SELECT count(*) FROM atlas_symbol_versions WHERE source_revision NOT LIKE 'sha256:%') AS legacy_revision_rows
  `)).rows[0];
  const liveRegistryCensus = {
    symbolRegistryRows: Number(censusRows.symbol_registry_rows),
    symbolVersionRows: Number(censusRows.symbol_version_rows),
    symbolVersionDistinctSourceRefs: Number(censusRows.distinct_source_refs),
    realRevisionSymbolVersionRows: Number(censusRows.real_revision_rows),
    legacyRevisionSymbolVersionRows: Number(censusRows.legacy_revision_rows),
    correctionNote: 'SESSION-206f\'s receipt mislabeled these two counts (registry vs versions swapped) -- these are independently re-queried and labeled here, per the review that caught it.',
  };

  // --- 2. Owner census (bounded, disclosed as bounded -- not exhaustive) ----------------------
  const ownerCensus = {
    method: 'git grep -lE for direct INSERT/UPDATE INTO atlas_symbol_registry|atlas_symbol_versions, and stableSymbolId=/symbolVersionId=/mint* helpers, under src/lib/server/atlas (excluding .spec.ts)',
    directWriterFilesFound: [],
    status: 'CANONICAL_WRITER_NOT_CONCLUSIVELY_IDENTIFIED',
    note: 'No literal INSERT/UPDATE INTO atlas_symbol_registry|atlas_symbol_versions and no stableSymbolId=/symbolVersionId= mint-assignment matched this bounded grep. graphify-symbol-writer-v1.ts (found in a prior session) writes stable_symbol_key/symbol_kind columns that do NOT match this table\'s real schema (stable_symbol_id, not stable_symbol_key) -- it targets a different table, not disambiguated here due to context budget. This is a real open finding, not resolved: exactly-one-canonical-owner is UNPROVEN, not confirmed.',
    requiresFollowUp: true,
  };

  // --- 3. Promotion policy (frozen here, no existing contract found to reuse) -----------------
  const promotionPolicy = {
    byKind: KIND_POLICY,
    unknownAlwaysRejected: KIND_POLICY.UNKNOWN === 'REJECT_PROMOTION',
    variablePolicyProven: false,
    note: 'No existing admission-policy contract was found to reuse (bounded search, context-limited) -- this freezes a conservative proposal: only FUNCTION/METHOD/CLASS/INTERFACE/TYPE/ENUM are CANONICAL_SYMBOL_ELIGIBLE. FILE and VARIABLE are CONDITIONAL (rejected until their scope -- module/class-field/local/parameter/destructuring for VARIABLE -- is explicitly decided). UNKNOWN is REJECT_PROMOTION, non-negotiable.',
  };

  // --- 4. Golden positive control: the 6 revision-current files, 85 known EXACT resolutions --
  const goldenControlItems = [];
  for (const relPath of KNOWN_REGISTERED_FILES) {
    const absPath = path.join(REPO_ROOT, relPath);
    const parsed = buildObservationsForFile(absPath);
    if (!parsed.ok) continue;
    const sourceRevision = sourceRevisionForFile(absPath);
    const { rows: registryRows } = await pool.query(
      `SELECT symbol_version_id, stable_symbol_id, source_revision, byte_start, byte_end, qualified_name
       FROM atlas_symbol_versions WHERE source_ref = ANY($1::text[])`,
      [[relPath, `sveltekit-frontend/${relPath}`]],
    );
    for (const sym of parsed.symbols) {
      const resolution = classifyObservation(sym, sourceRevision, registryRows);
      const action = classifyPopulationAction(sym, resolution, UPSTREAM_FILE_IDENTITY_RESOLVED);
      goldenControlItems.push({ relPath, symbolKind: sym.symbolKind, ...action });
    }
  }
  const goldenExactCount = goldenControlItems.filter((i) => i.action === 'EXACT_CURRENT_VERSION_EXISTS').length;
  const goldenDuplicateProposals = goldenControlItems.filter((i) => i.action === 'EXACT_CURRENT_VERSION_EXISTS' && (i.proposedRegistryInsert || i.proposedVersionInsert)).length;

  // --- 5. Legacy negative control: a known workspace:0 file -----------------------------------
  const legacyFile = 'src/lib/ai/base64-fp32-quantizer.ts'; // verified live 2026-09-22: 24 rows, all source_revision='workspace:0'
  const legacyAbsPath = path.join(REPO_ROOT, legacyFile);
  const legacyParsed = buildObservationsForFile(legacyAbsPath);
  const legacySourceRevision = sourceRevisionForFile(legacyAbsPath);
  const { rows: legacyRegistryRows } = await pool.query(
    `SELECT symbol_version_id, stable_symbol_id, source_revision, byte_start, byte_end, qualified_name FROM atlas_symbol_versions WHERE source_ref = $1`,
    [legacyFile],
  );
  const legacyItems = legacyParsed.ok
    ? legacyParsed.symbols.map((sym) => {
        const resolution = classifyObservation(sym, legacySourceRevision, legacyRegistryRows);
        const action = classifyPopulationAction(sym, resolution, UPSTREAM_FILE_IDENTITY_RESOLVED);
        return { symbolKind: sym.symbolKind, ...action };
      })
    : [];
  const legacyControlPassed =
    legacyItems.length > 0 &&
    legacyItems.every((i) => i.action !== 'EXACT_CURRENT_VERSION_EXISTS') &&
    legacyItems.some((i) => i.action === 'LEGACY_LOGICAL_SYMBOL_CONTINUITY_UNPROVEN' || i.action === 'REJECT_KIND_POLICY' || i.action === 'REJECT_UNKNOWN_KIND');

  // --- 6. Full corpus preview (300 files, reusing SYMBOL-WIRE-01's own cohort) ---------------
  const corpus = existsSync(CORPUS_PATH) ? JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) : { files: [] };
  const actionCounts = {};
  const countsByKind = {};
  let totalObservations = 0;
  let filesParsed = 0;

  for (const relPath of corpus.files) {
    const absPath = path.join(REPO_ROOT, relPath);
    if (!existsSync(absPath)) continue;
    const parsed = buildObservationsForFile(absPath);
    if (!parsed.ok) continue;
    filesParsed += 1;
    const sourceRevision = sourceRevisionForFile(absPath);
    const { rows: registryRows } = await pool.query(
      `SELECT symbol_version_id, stable_symbol_id, source_revision, byte_start, byte_end, qualified_name
       FROM atlas_symbol_versions WHERE source_ref = ANY($1::text[])`,
      [[relPath, `sveltekit-frontend/${relPath}`]],
    );
    for (const sym of parsed.symbols) {
      totalObservations += 1;
      const resolution = classifyObservation(sym, sourceRevision, registryRows);
      const action = classifyPopulationAction(sym, resolution, UPSTREAM_FILE_IDENTITY_RESOLVED);
      actionCounts[action.action] = (actionCounts[action.action] ?? 0) + 1;
      countsByKind[sym.symbolKind] = (countsByKind[sym.symbolKind] ?? 0) + 1;
    }
  }

  await pool.end();

  const eligibleLogicalSymbols = actionCounts.NEW_LOGICAL_SYMBOL_AND_VERSION ?? 0; // 0 -- blocked on upstream file identity
  const eligibleSymbolVersions = eligibleLogicalSymbols; // 1:1 for new symbols in this bounded preview

  // --- 7. Canary: 6 known + 1 legacy negative control (bounded by context this gate) ---------
  const canaryFiles = [...KNOWN_REGISTERED_FILES, legacyFile];
  const canaryChecksum = `sha256:${createHash('sha256').update(canaryFiles.slice().sort().join('|')).digest('hex')}`;

  const result = UPSTREAM_FILE_IDENTITY_RESOLVED
    ? 'SYMBOL_REGISTRY_POPULATION_PREVIEW_READY'
    : 'SYMBOL_REGISTRY_POPULATION_PREVIEW_READY_APPLY_BLOCKED_UPSTREAM_FILE_IDENTITY';

  const receipt = {
    schema: 'atlas.symbol-registry-population-preview.v1',
    gate: 'SYMBOL-REGISTRY-POPULATION-PREVIEW-01',
    generatedAt: new Date().toISOString(),
    liveRegistryCensus,
    ownerCensus,
    upstreamIdentityStatus: {
      resolved: UPSTREAM_FILE_IDENTITY_RESOLVED,
      evidence: UPSTREAM_FILE_IDENTITY_EVIDENCE,
      applyBlocker: UPSTREAM_FILE_IDENTITY_RESOLVED ? null : 'BLOCKED_UPSTREAM_FILE_IDENTITY',
    },
    promotionPolicy,
    goldenPositiveControl: {
      files: KNOWN_REGISTERED_FILES,
      totalObservations: goldenControlItems.length,
      exactCurrentVersionExistsCount: goldenExactCount,
      duplicateInsertProposals: goldenDuplicateProposals,
      passed: goldenExactCount === 85 && goldenDuplicateProposals === 0,
      note: goldenExactCount === 85 && goldenDuplicateProposals === 0
        ? 'Reproduced the known 85 EXACT_CURRENT_VERSION_EXISTS resolutions from SESSION-206f with zero duplicate-insert proposals -- planner does not propose re-creating symbols that already exist.'
        : `Expected 85 EXACT with 0 duplicate proposals; got ${goldenExactCount} EXACT / ${goldenDuplicateProposals} duplicate proposals -- INVESTIGATE before trusting this preview.`,
    },
    legacyNegativeControl: {
      file: legacyFile,
      totalObservations: legacyItems.length,
      actionsSeen: [...new Set(legacyItems.map((i) => i.action))],
      neverClassifiedExact: legacyItems.every((i) => i.action !== 'EXACT_CURRENT_VERSION_EXISTS'),
      passed: legacyControlPassed,
    },
    preview: {
      corpusSize: corpus.files.length,
      filesParsed,
      observationCount: totalObservations,
      eligibleLogicalSymbols,
      eligibleSymbolVersions,
      actionCounts,
      countsByKind,
      note: 'eligibleLogicalSymbols is NOT totalObservations -- it is gated by promotion policy (kind eligibility) AND upstream file identity. With UPSTREAM_FILE_IDENTITY_RESOLVED=false, this is currently forced to 0 for genuinely-new symbols (REGISTRY_MISSING observations classify REJECT_FILE_IDENTITY, not NEW_LOGICAL_SYMBOL_AND_VERSION) -- reflects the real blocker, not an error.',
    },
    canary: {
      fileCount: canaryFiles.length,
      files: canaryFiles,
      checksum: canaryChecksum,
      composition: '6 golden-positive-control files (no-write, EXACT reproduction) + 1 legacy-negative-control file (fail-closed reproduction). Genuinely-new eligible files NOT included in this pass -- would require UPSTREAM_FILE_IDENTITY_RESOLVED=true to produce a non-degenerate NEW_LOGICAL_SYMBOL_AND_VERSION example, which is the current blocker.',
    },
    writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphifyRuns: 0 },
    canonicalAuthority: false,
    writesPerformed: false,
    result,
  };

  writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  console.log(`liveRegistryCensus: ${JSON.stringify(liveRegistryCensus)}`);
  console.log(`goldenPositiveControl: exact=${goldenExactCount}/85 duplicateProposals=${goldenDuplicateProposals} passed=${receipt.goldenPositiveControl.passed}`);
  console.log(`legacyNegativeControl: passed=${legacyControlPassed} actionsSeen=${JSON.stringify(receipt.legacyNegativeControl.actionsSeen)}`);
  console.log(`preview: observations=${totalObservations} eligibleLogicalSymbols=${eligibleLogicalSymbols} actionCounts=${JSON.stringify(actionCounts)}`);
  console.log(`Result: ${result}`);
  console.log(`Receipt: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
