#!/usr/bin/env node
// SYMBOL-PROMOTED-UNKNOWN-01
//
// Answers the real question: not "how many UNKNOWN observations exist" but "how many UNKNOWN
// observations actually reached canonical symbol identity (atlas_symbol_registry.symbol_kind)".
// Fail-closed EXACT resolution: source_ref + source_revision (real content-hash match) + unique
// exact UTF-8 byte span, cross-checked by name where both sides have one. NO name-only joins,
// NO path-only joins, NO latest-symbol-version substitution, NO fuzzy matching as identity, NO
// workspace-revision-for-source-revision substitution.
//
// Runs against the UNION of the SYMBOL-WIRE-01/02 300-file corpus and the small set of files
// verified live (2026-09-22) to actually have current, revision-matching atlas_symbol_versions
// rows -- otherwise this measurement would be starved by sampling bias and answer nothing (see
// SESSION-206e: the 300-file deterministic sample happened to include none of the 15 registered
// files). This is a deliberate corpus-composition choice, recorded here, not hidden.
//
// Read-only against Postgres (SELECT only). Writes only
// docs/reports/symbol-promoted-unknown-audit-v1.json.
// canonicalAuthority=false, writesPerformed=false.
//
// Run from sveltekit-frontend/: npx tsx scripts/atlas/symbol-promoted-unknown-audit-v1.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { buildObservationsForFile, sourceRevisionForFile } from './lib/symbol-wire-observation-runner.mjs';
import { classifyObservation, aggregatePromotedUnknown } from './lib/symbol-promoted-unknown-classifier.mjs';

const SIDECAR_URL = process.env.NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const USE_LIVE_SIDECAR = process.argv.includes('--live-sidecar');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // sveltekit-frontend/
const CORPUS_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-corpus-v1.json');
const OUT_PATH = path.join(
  REPO_ROOT, 'docs', 'reports',
  USE_LIVE_SIDECAR ? 'symbol-promoted-unknown-audit-live-sidecar-v1.json' : 'symbol-promoted-unknown-audit-v1.json',
);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// Verified live 2026-09-22 (SESSION-206e/f): the only files under a src/ prefix with a
// source_revision that is a real (non-legacy) content hash. Included explicitly so this audit
// has a non-degenerate answer -- see header note.
const KNOWN_REGISTERED_FILES = [
  'src/lib/server/ace/llm-context-cache.ts',
  'src/lib/server/services/error-analysis/CacheService.ts',
  'src/lib/server/services/error-analysis/DecisionEngine.ts',
  'src/lib/server/services/error-analysis/ErrorClustering.ts',
  'src/lib/server/services/error-analysis/EscalationService.ts',
  'src/lib/server/services/error-analysis/FixSynthesizer.ts',
];

const REPO_ROOT_FOR_IMPORT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { normalizeStructuralSymbolKind } = await import(
  pathToFileURL(
    path.join(REPO_ROOT_FOR_IMPORT, 'src', 'lib', 'server', 'atlas', 'indexing', 'structural-observation-v1.ts'),
  ).href
);

/**
 * Real live-sidecar chunk stream, unfiltered -- unlike buildObservationsForFile() (SYMBOL-WIRE-01,
 * pre-filtered to a known-good node-type allowlist, structurally CANNOT emit UNKNOWN), this
 * producer can genuinely classify as UNKNOWN (export/import/etc.), which is required for the
 * promoted-UNKNOWN question to be answerable at all. Returns the SAME symbol record shape as
 * buildObservationsForFile() so downstream classification logic is unchanged.
 */
async function buildObservationsFromLiveSidecar(relPath, absPath, sourceRevision) {
  const source = readFileSync(absPath, 'utf8');
  const res = await fetch(`${SIDECAR_URL}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, language: 'typescript', filePath: relPath, sourceRevision }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${res.statusText}` };
  }
  const data = await res.json();
  if (data.schema !== 'atlas.ast.evidence.v1' || !Array.isArray(data.chunks)) {
    return { ok: false, error: 'invalid atlas.ast.evidence.v1 payload' };
  }
  const symbols = data.chunks.map((chunk) => ({
    rawNodeType: chunk.node_type,
    symbolKind: normalizeStructuralSymbolKind(chunk.kind, chunk.node_type),
    name: chunk.name ?? null,
    utf8StartByte: chunk.start_byte,
    utf8EndByte: chunk.end_byte,
    upstreamChunkId: chunk.upstream_chunk_id ?? null,
  }));
  return { ok: true, symbols };
}

// classifyObservation() and aggregatePromotedUnknown() are imported from
// lib/symbol-promoted-unknown-classifier.mjs, which is unit-tested directly by
// src/lib/server/atlas/indexing/symbol-promoted-unknown-classifier-v1.spec.ts -- this script
// only wires that tested pure logic to real Postgres data, it does not reimplement it.

async function main() {
  if (!existsSync(CORPUS_PATH)) {
    console.error(`Corpus manifest not found: ${CORPUS_PATH}`);
    process.exitCode = 1;
    return;
  }
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  // --live-sidecar mode: scope to just the known-registered files (the only ones with any real
  // registry signal) rather than calling the sidecar across the full 306-file union -- both
  // slower and pointless for files with zero registry rows regardless of observation source.
  const files = USE_LIVE_SIDECAR
    ? KNOWN_REGISTERED_FILES
    : [...new Set([...corpus.files, ...KNOWN_REGISTERED_FILES])];

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

  const bucketCounts = {
    EXACT: 0,
    REGISTRY_MISSING: 0,
    AMBIGUOUS: 0,
    REVISION_MISMATCH: 0,
    SPAN_MISMATCH: 0,
    NAME_OR_SIGNATURE_MISMATCH: 0,
    UNRESOLVED_OTHER: 0,
  };

  let filesParsed = 0;
  let filesFailed = 0;
  let totalObservations = 0;
  let rawUnknownObservations = 0;

  const classifiedItems = []; // fed to aggregatePromotedUnknown() once, at the end

  try {
    console.log(
      USE_LIVE_SIDECAR
        ? `Resolving ${files.length} known-registered files via LIVE SIDECAR chunks (unfiltered, can genuinely be UNKNOWN) against atlas_symbol_versions...`
        : `Resolving ${files.length} files (corpus UNION known-registered) via tree-sitter observations against atlas_symbol_versions...`,
    );
    for (const relPath of files) {
      const absPath = path.join(REPO_ROOT, relPath);
      if (!existsSync(absPath)) {
        filesFailed += 1;
        continue;
      }
      const sourceRevision = sourceRevisionForFile(absPath);
      const parsed = USE_LIVE_SIDECAR
        ? await buildObservationsFromLiveSidecar(relPath, absPath, sourceRevision)
        : buildObservationsForFile(absPath);
      if (!parsed.ok) {
        filesFailed += 1;
        continue;
      }
      filesParsed += 1;

      const { rows: registryRows } = await pool.query(
        `SELECT symbol_version_id, stable_symbol_id, source_revision, byte_start, byte_end, qualified_name
         FROM atlas_symbol_versions WHERE source_ref = ANY($1::text[])`,
        [[relPath, `sveltekit-frontend/${relPath}`]],
      );

      for (const sym of parsed.symbols) {
        totalObservations += 1;
        if (sym.symbolKind === 'UNKNOWN') rawUnknownObservations += 1;

        const classification = classifyObservation(sym, sourceRevision, registryRows);
        const bucketStatus = bucketCounts.hasOwnProperty(classification.status) ? classification.status : 'UNRESOLVED_OTHER';
        bucketCounts[bucketStatus] += 1;

        let registrySymbolKind = null;
        if (classification.status === 'EXACT') {
          // Fetch the registry row's canonical symbol_kind for this stable_symbol_id -- this is
          // the step that distinguishes "promoted UNKNOWN" from "just an EXACT resolution".
          const { rows: registryKindRows } = await pool.query(
            `SELECT symbol_kind FROM atlas_symbol_registry WHERE stable_symbol_id = $1`,
            [classification.stableSymbolId],
          );
          registrySymbolKind = registryKindRows[0]?.symbol_kind ?? null;
        }

        classifiedItems.push({ relPath, symbolKind: sym.symbolKind, classification, registrySymbolKind });
      }
    }
  } finally {
    await pool.end();
  }

  const aggregate = aggregatePromotedUnknown(classifiedItems);
  const {
    exactResolvedObservations,
    exactResolvedUnknownObservations,
    promotedUnknown,
    inverseAnomalies: { observationUnknownRegistryTyped: observationUnknownRegistryTypedRows, typedObservationToUnknownRegistry: typedObservationUnknownRegistryRows },
  } = aggregate;
  const promotedUnknownRegistryRowCount = promotedUnknown.registryRowCount;
  const status = exactResolvedObservations === 0
    ? 'BLOCKED_INSUFFICIENT_EXACT_RESOLUTION'
    : 'SYMBOL_PROMOTED_UNKNOWN_AUDIT_PROVEN';

  const receipt = {
    schema: 'atlas.symbol-promoted-unknown-audit.v1',
    generatedAt: new Date().toISOString(),
    observationSource: USE_LIVE_SIDECAR
      ? 'LIVE_SIDECAR_UNFILTERED_CHUNKS'
      : 'TREE_SITTER_DECLARATION_NODE_TYPES_ONLY_STRUCTURALLY_CANNOT_PRODUCE_RAW_UNKNOWN',
    corpusComposition: {
      wire01CorpusSize: corpus.corpusSize,
      knownRegisteredFilesAdded: KNOWN_REGISTERED_FILES,
      totalFilesRequested: files.length,
    },
    filesParsed,
    filesFailed,
    totalObservations,
    rawUnknownObservations,
    rawUnknownRate: totalObservations > 0 ? rawUnknownObservations / totalObservations : null,
    resolutionClassification: bucketCounts,
    exactResolvedObservations,
    exactResolvedUnknownObservations,
    promotedUnknown,
    inverseAnomalies: {
      observationUnknownRegistryTyped: {
        count: observationUnknownRegistryTypedRows.length,
        note: 'Observation classified UNKNOWN but exact-matched registry identity has a real structural kind -- likely producer/normalizer drift, not registry pollution.',
        samples: observationUnknownRegistryTypedRows.slice(0, 10),
      },
      typedObservationToUnknownRegistry: {
        count: typedObservationUnknownRegistryRows.length,
        note: 'Observation classified as a known structural kind but exact-matched registry row is itself symbol_kind=UNKNOWN -- potentially more serious than chunk-boundary noise.',
        samples: typedObservationUnknownRegistryRows.slice(0, 10),
      },
    },
    limitations: [
      'Parent-evidence (parent_route) is NOT evaluated as part of EXACT resolution -- neither ' +
        'this producer\'s synthetic observations nor the current comparison carry usable ' +
        'parent_route data on both sides. Disclosed, not fabricated as a passing check.',
      'NAME_OR_SIGNATURE_MISMATCH is only evaluated when both the observation and the matched ' +
        'registry row carry a name -- absence on either side does not count as a mismatch.',
    ],
    canonicalAuthority: false,
    writesPerformed: false,
    overallVerdict: status,
    notes: [
      status === 'BLOCKED_INSUFFICIENT_EXACT_RESOLUTION'
        ? 'Zero observations resolved EXACT even after adding the known-registered files -- the ' +
          'promoted-UNKNOWN question cannot be answered from live data yet. Route next to the ' +
          'symbol-registry/version population gate rather than inventing fuzzy promotion.'
        : `${exactResolvedObservations} observations resolved EXACT; the canonical pollution ` +
          `count is ${promotedUnknownRegistryRowCount} distinct registry rows (NOT ` +
          `${exactResolvedUnknownObservations} raw UNKNOWN observations -- those numbers are ` +
          'genuinely different, per the worked example in the review that scoped this audit).',
    ],
  };

  writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`Files parsed: ${filesParsed}  failed: ${filesFailed}`);
  console.log(`Total observations: ${totalObservations}  raw UNKNOWN: ${rawUnknownObservations}`);
  console.log(`Resolution buckets: ${JSON.stringify(bucketCounts)}`);
  console.log(`Exact-resolved: ${exactResolvedObservations}  Exact-resolved-UNKNOWN: ${exactResolvedUnknownObservations}`);
  console.log(`Promoted UNKNOWN: observations=${promotedUnknown.observationLevelCount} distinctSymbolVersions=${promotedUnknown.distinctSymbolVersionCount} distinctStableSymbols=${promotedUnknown.distinctStableSymbolCount} registryRows=${promotedUnknownRegistryRowCount}`);
  console.log(`observationUnknownRegistryTyped: ${observationUnknownRegistryTypedRows.length}`);
  console.log(`typedObservationToUnknownRegistry: ${typedObservationUnknownRegistryRows.length}`);
  console.log(`Overall: ${status}`);
  console.log(`Receipt: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
