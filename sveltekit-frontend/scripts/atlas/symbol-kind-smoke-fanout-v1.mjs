#!/usr/bin/env node
// SYMBOL-WIRE-01 (supersedes the narrower SYMBOL-KIND-COVERAGE-AUDIT-01 fan-out) +
// SYMBOL-KIND-SCHEMA-VALIDATION-01, unchanged.
//
// Reads the manifest written by define-symbol-kind-corpus-v1.mjs, fans out (bounded
// concurrency) over every file, parses it with the real tree-sitter-typescript grammar, and
// for every declaration node:
//   1. Classifies it through the CANONICAL normalizer (normalizeStructuralSymbolKind).
//   2. Converts its span from tree-sitter-npm-package UTF-16 code-unit indices to real UTF-8
//      bytes via ONE reusable per-file converter (createSourceOffsetConverter -- built once per
//      file, not recomputed per symbol) -- fixes a real, empirically-proven gap: the installed
//      tree-sitter runtime (0.25.1 + tree-sitter-typescript 0.23.2, JS-string input mode) exposes
//      UTF-16 code-unit indexing, not UTF-8 bytes, contrary to upstream @types/tree-sitter's
//      documented byte-offset contract -- see source-coordinate-map-v1.ts's header comment.
//   3. Projects the grounded UTF-8 span through the CANONICAL projectStructuralObservation()
//      (structural-observation-v1.ts) to get a real StructuralObservationV1 -- span validity,
//      name-containment, the works -- not just a kind label.
//
// All classification/coordinate/observation logic is REUSED from the canonical modules, per this
// repo's Duplication Prevention rule -- nothing here reimplements normalizeStructuralSymbolKind,
// createSourceOffsetConverter, or projectStructuralObservation.
//
// Exit condition for SYMBOL_WIRE_01_UTF8_GROUNDING_PROVEN (per review): 300/300 source revisions
// computed, all projected observations span-valid, 0 byte-span mismatches, non-ASCII/astral/
// round-trip regressions passing (see source-coordinate-map-v1.spec.ts, run separately).
//
// STOP CONDITION (explicit, per review): this script does NOT attempt SymbolVersion resolution,
// POS linkage, retrieval, BitFrost/ACE, Graphify, or any canonical writes. That is SYMBOL-WIRE-02+
// and is out of scope here on purpose.
//
// Read-only. Writes only docs/reports/symbol-kind-smoke-fanout-v1.json.
// canonicalAuthority=false, writesPerformed=false -- no Postgres/Qdrant/Redis writes.
//
// Run from sveltekit-frontend/: npx tsx scripts/atlas/symbol-kind-smoke-fanout-v1.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import YAML from 'yaml';
import {
  buildObservationsForFile,
  sourceRevisionForFile,
  TREE_SITTER_VERSION,
  TREE_SITTER_TYPESCRIPT_VERSION,
} from './lib/symbol-wire-observation-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // sveltekit-frontend/
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');   // deeds-web-app/
const CORPUS_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-corpus-v1.json');
const OKF_TS_LANG_PATH = path.join(WORKSPACE_ROOT, '.okf', 'languages', 'typescript.yaml');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-smoke-fanout-v1.json');

const CONCURRENCY = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 8);

// --- reuse the canonical normalizer directly for the .okf schema-validation cross-check ----
const { normalizeStructuralSymbolKind } = await import(
  pathToFileURL(
    path.join(REPO_ROOT, 'src', 'lib', 'server', 'atlas', 'indexing', 'structural-observation-v1.ts'),
  ).href
);

// Runtime proof (per review: don't just assert the coordinate-basis finding, record the exact
// installed versions and an empirical fixture checksum so a future package upgrade changing this
// behavior is detectable, not silently trusted forever). Versions come from the shared runner
// module (imported above) so both SYMBOL-WIRE-01 and SYMBOL-WIRE-02 report identical values.
const COORDINATE_BASIS_PROOF_FIXTURE = 'const x = "中中中"; function foo() {}';
function proveCoordinateBasisEmpirically() {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(COORDINATE_BASIS_PROOF_FIXTURE);
  let fnNode = null;
  (function walk(n) {
    if (n.type === 'function_declaration') fnNode = n;
    for (let i = 0; i < n.childCount; i += 1) walk(n.child(i));
  })(tree.rootNode);
  const utf16Idx = COORDINATE_BASIS_PROOF_FIXTURE.indexOf('function foo');
  const expectedUtf8Byte = Buffer.byteLength(COORDINATE_BASIS_PROOF_FIXTURE.slice(0, utf16Idx), 'utf8');
  const observedIsUtf16 = fnNode.startIndex === utf16Idx && fnNode.startIndex !== expectedUtf8Byte;
  return {
    fixtureChecksum: `sha256:${createHash('sha256').update(COORDINATE_BASIS_PROOF_FIXTURE).digest('hex')}`,
    observedStartIndex: fnNode.startIndex,
    expectedUtf16CodeUnitIndex: utf16Idx,
    expectedUtf8ByteIndex: expectedUtf8Byte,
    observedCoordinateSemantics: observedIsUtf16 ? 'UTF16_CODE_UNITS' : 'AMBIGUOUS_OR_UTF8_BYTES',
  };
}

async function asyncPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runNext() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

function runCoverageAudit(corpus) {
  return asyncPool(
    corpus.files,
    (relPath) => {
      const absPath = path.join(REPO_ROOT, relPath);
      if (!existsSync(absPath)) {
        return { relPath, ok: false, error: 'FILE_MISSING' };
      }
      // sourceRevision is the file's own exact-byte content hash (matches structural-observation-v1's
      // own fingerprintStructuralSource sha256, computed once per file and reused for every symbol
      // in that file, per the review's "sourceRevision must fingerprint the exact source bytes used
      // to construct the coordinate map" requirement -- not a git commit, since this smoke test
      // spans an arbitrary sample of files, not one coherent workspace revision).
      const sourceRevision = sourceRevisionForFile(absPath);
      const parsed = buildObservationsForFile(absPath, sourceRevision, corpus.workspaceRevision);
      if (!parsed.ok) {
        return { relPath, ok: false, error: parsed.error };
      }
      const sourceRevisionMatchesFingerprint = sourceRevision === `sha256:${parsed.fingerprintSha256}`;
      return {
        relPath,
        ok: true,
        symbols: parsed.symbols,
        sourceRevisionMatchesFingerprint,
        projectionFailures: parsed.projectionFailures,
      };
    },
    CONCURRENCY,
  );
}

function aggregateCoverage(perFileResults) {
  const counts = {};
  const unknownRawKinds = {};
  let filesParsed = 0;
  let filesFailed = 0;
  let totalSymbols = 0;
  let sourceRevisionMatchedFiles = 0;
  let spanWithinSourceBytesCount = 0;
  let envelopeAttachedCount = 0;
  let utf8RoundTripMatchedCount = 0;
  let negativeLengthCount = 0;
  let outOfBoundsCount = 0;
  let projectionFailuresCount = 0;

  for (const r of perFileResults) {
    if (!r.ok) {
      filesFailed += 1;
      continue;
    }
    filesParsed += 1;
    if (r.sourceRevisionMatchesFingerprint) sourceRevisionMatchedFiles += 1;
    projectionFailuresCount += r.projectionFailures ?? 0;
    for (const sym of r.symbols) {
      totalSymbols += 1;
      counts[sym.symbolKind] = (counts[sym.symbolKind] ?? 0) + 1;
      if (sym.symbolKind === 'UNKNOWN') {
        unknownRawKinds[sym.rawNodeType] = (unknownRawKinds[sym.rawNodeType] ?? 0) + 1;
      }
      if (sym.spanValid) spanWithinSourceBytesCount += 1;
      if (sym.sourceRef && sym.sourceRevision && sym.workspaceRevision) envelopeAttachedCount += 1;
      if (sym.roundTripMatched) utf8RoundTripMatchedCount += 1;
      if (sym.negativeLength) negativeLengthCount += 1;
      if (sym.outOfBounds) outOfBoundsCount += 1;
    }
  }

  const unknownCount = counts.UNKNOWN ?? 0;

  return {
    filesParsed,
    filesFailed,
    totalSymbols,
    sourceRevisionMatched: `${sourceRevisionMatchedFiles}/${filesParsed}`,
    spanWithinSourceBytes: `${spanWithinSourceBytesCount}/${totalSymbols}`,
    envelopeAttached: `${envelopeAttachedCount}/${totalSymbols}`);
    utf8RoundTripMatched: `${utf8RoundTripMatchedCount}/${totalSymbols}`,
    negativeLength: negativeLengthCount,
    outOfBounds: outOfBoundsCount,
    projectionFailures: projectionFailuresCount,
    countsBySymbolKind: counts,
    unknownCount,
    unknownRate: totalSymbols > 0 ? unknownCount / totalSymbols : null,
    topUnknownRawNodeTypes: Object.entries(unknownRawKinds)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([rawNodeType, count]) => ({ rawNodeType, count })),
  };
}

function runSchemaValidation() {
  if (!existsSync(OKF_TS_LANG_PATH)) {
    return { status: 'SKIPPED_MISSING_OKF_FILE', okfPath: path.relative(WORKSPACE_ROOT, OKF_TS_LANG_PATH), checks: [] };
  }
  const doc = YAML.parse(readFileSync(OKF_TS_LANG_PATH, 'utf8'));
  const symbolKinds = doc?.symbol_kinds ?? {};
  const checks = [];

  for (const [okfKindName, def] of Object.entries(symbolKinds)) {
    if (!def?.ast_labels || def.ast_labels.length === 0) {
      checks.push({
        okfKindName,
        status: 'SKIPPED_PATTERN_BASED_NOT_AST_LABEL',
        reason: 'no ast_labels declared (evidence/imports/symbol_patterns/path_patterns/filename_patterns-based instead -- see SESSION-206c vocabulary-ownership finding, different dimension by design)',
      });
      continue;
    }
    for (const label of def.ast_labels) {
      const resolved = normalizeStructuralSymbolKind(label, label);
      checks.push({ okfKindName, astLabel: label, resolvedSymbolKind: resolved, status: resolved === 'UNKNOWN' ? 'FAIL_UNRESOLVED' : 'PASS' });
    }
  }

  const failed = checks.filter((c) => c.status === 'FAIL_UNRESOLVED');
  return {
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    okfPath: path.relative(WORKSPACE_ROOT, OKF_TS_LANG_PATH),
    totalChecks: checks.filter((c) => c.status !== 'SKIPPED_PATTERN_BASED_NOT_AST_LABEL').length,
    failedChecks: failed.length,
    checks,
  };
}

async function main() {
  if (!existsSync(CORPUS_PATH)) {
    console.error(`Corpus manifest not found: ${CORPUS_PATH}`);
    console.error('Run: node scripts/atlas/define-symbol-kind-corpus-v1.mjs first');
    process.exitCode = 1;
    return;
  }
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));

  console.log(`Fanning out over ${corpus.files.length} files (concurrency=${CONCURRENCY})...`);
  const perFileResults = await runCoverageAudit(corpus);
  const coverage = aggregateCoverage(perFileResults);

  console.log('Running schema-validation cross-check against .okf/languages/typescript.yaml...');
  const schemaValidation = runSchemaValidation();

  console.log('Recording empirical coordinate-basis proof (versions + fixture checksum)...');
  const coordinateBasisProof = proveCoordinateBasisEmpirically();

  const exitConditionMet =
    coverage.filesFailed === 0 &&
    coverage.negativeLength === 0 &&
    coverage.outOfBounds === 0 &&
    coverage.projectionFailures === 0 &&
    coverage.spanWithinSourceBytes === `${coverage.totalSymbols}/${coverage.totalSymbols}` &&
    coverage.utf8RoundTripMatched === `${coverage.totalSymbols}/${coverage.totalSymbols}` &&
    coverage.sourceRevisionMatched === `${coverage.filesParsed}/${coverage.filesParsed}` &&
    schemaValidation.status === 'PASS';

  const receipt = {
    schema: 'atlas.symbol-wire-01-utf8-grounding.v1',
    generatedAt: new Date().toISOString(),
    corpusManifestUsed: {
      workspaceRevision: corpus.workspaceRevision,
      corpusSize: corpus.corpusSize,
      generatedAt: corpus.generatedAt,
    },
    coordinateBasisInput: 'NODE_TREE_SITTER_JS',
    coordinateBasisOutput: 'UTF8_PARSER_BUFFER_V1',
    runtimeProof: {
      treeSitterVersion: TREE_SITTER_VERSION,
      treeSitterTypescriptVersion: TREE_SITTER_TYPESCRIPT_VERSION,
      inputMode: 'JS_STRING',
      ...coordinateBasisProof,
    },
    coverageAudit: coverage,
    schemaValidation,
    overallVerdict: exitConditionMet ? 'SYMBOL_WIRE_01_UTF8_GROUNDING_PROVEN' : 'SYMBOL_WIRE_01_NOT_PROVEN',
    canonicalAuthority: false,
    writesPerformed: false,
    notes: [
      'Read-only. No Postgres/Qdrant/Redis writes. Corpus is a bounded, deterministic sample, not the full repo.',
      'SCOPE (per review, deliberately narrow): this proves structural observations are correctly ' +
        'revision- and byte-grounded for the declared DECLARATION_NODE_TYPES set. It does NOT yet ' +
        'measure the live :8095 sidecar\'s FRAGMENT/DECLARATION/CHUNK-boundary UNKNOWN rate -- that ' +
        'remains SYMBOL-KIND-LIVE-SIDECAR-COVERAGE-01, a separate follow-up.',
      'STOP CONDITION (explicit, per review): SymbolVersion resolution, POS/ACE/retrieval linkage, ' +
        'BitFrost/Redis-Valkey writes, and canonical promotion are OUT OF SCOPE for this script. ' +
        'This is SYMBOL-WIRE-01 only -- the next step is SYMBOL-WIRE-02 (classify each observation ' +
        'against EXACT/REGISTRY_MISSING/AMBIGUOUS/REVISION_MISMATCH/SPAN_MISMATCH against ' +
        'atlas_symbol_registry/atlas_symbol_versions), not started here.',
    ],
  };

  writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`Files parsed: ${coverage.filesParsed}  failed: ${coverage.filesFailed}`);
  console.log(`Total symbols classified: ${coverage.totalSymbols}`);
  console.log(`sourceRevisionMatched: ${coverage.sourceRevisionMatched}`);
  console.log(`spanWithinSourceBytes: ${coverage.spanWithinSourceBytes}`);
  console.log(`utf8RoundTripMatched: ${coverage.utf8RoundTripMatched}`);
  console.log(`negativeLength: ${coverage.negativeLength}  outOfBounds: ${coverage.outOfBounds}  projectionFailures: ${coverage.projectionFailures}`);
  console.log(`UNKNOWN: ${coverage.unknownCount} (rate=${coverage.unknownRate?.toFixed(4) ?? 'n/a'})`);
  console.log(`Counts by kind: ${JSON.stringify(coverage.countsBySymbolKind)}`);
  console.log(`Schema validation: ${schemaValidation.status} (${schemaValidation.failedChecks ?? 0}/${schemaValidation.totalChecks ?? 0} failed)`);
  console.log(`Coordinate basis proof: ${JSON.stringify(coordinateBasisProof)}`);
  console.log(`Overall: ${receipt.overallVerdict}`);
  console.log(`Receipt: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
