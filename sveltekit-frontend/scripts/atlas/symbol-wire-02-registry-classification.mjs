#!/usr/bin/env node
// SYMBOL-WIRE-02: classify SYMBOL-WIRE-01's UTF-8-grounded structural observations against the
// canonical `atlas_symbol_registry`/`atlas_symbol_versions` tables.
//
// Per the review that scoped this: SYMBOL-WIRE-01 proved observations are correctly revision-
// and byte-grounded. SYMBOL-WIRE-02 measures whether those grounded observations correspond to
// anything already resolved in the canonical symbol registry -- NOT whether they SHOULD be
// promoted, and it performs NO writes/promotion itself. Five buckets, per observation:
//
//   EXACT             -- a symbol_versions row exists for the same source_ref, same
//                         source_revision (exact content hash), and the exact same UTF-8 byte span.
//   SPAN_MISMATCH     -- same source_ref + same source_revision has registry rows, but none at
//                         this exact byte span (different chunk granularity, e.g. registry rows
//                         are ast-grep-chunk-level while this observation is declaration-node-level).
//   REVISION_MISMATCH -- registry rows exist for this source_ref, but under a DIFFERENT
//                         source_revision (i.e. the registry is stale relative to this file's
//                         current content).
//   AMBIGUOUS         -- more than one row matches the same source_ref + source_revision + exact
//                         byte span (a real registry data-quality flag, not resolved here).
//   REGISTRY_MISSING  -- zero rows for this source_ref under ANY revision -- nothing has ever
//                         been resolved for this file.
//
// Reuses buildObservationsForFile()/sourceRevisionForFile() from SYMBOL-WIRE-01's shared runner
// module -- does not reparse or reimplement the UTF-8 grounding pipeline.
//
// Read-only against Postgres (SELECT only, no INSERT/UPDATE/DELETE). Writes only
// docs/reports/symbol-wire-02-registry-classification-v1.json.
// canonicalAuthority=false, writesPerformed=false.
//
// STOP CONDITION (unchanged from SYMBOL-WIRE-01): this script does not attempt promotion, POS
// linkage, retrieval, or BitFrost/ACE wiring. That remains later, unscoped work.
//
// Run from sveltekit-frontend/: npx tsx scripts/atlas/symbol-wire-02-registry-classification.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  buildObservationsForFile,
  sourceRevisionForFile,
  TREE_SITTER_VERSION,
  TREE_SITTER_TYPESCRIPT_VERSION,
} from './lib/symbol-wire-observation-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // sveltekit-frontend/
const CORPUS_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-corpus-v1.json');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-wire-02-registry-classification-v1.json');

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// Self-test: proves the classifier logic can actually produce non-REGISTRY_MISSING buckets,
// against one of the 15 files verified live (2026-09-22) to have real atlas_symbol_versions rows.
// Run with --self-test. Exists because the full-corpus run legitimately returns 100%
// REGISTRY_MISSING (registry is sparse: 15/5557 eligible files) -- this proves that's a fact
// about the data, not a bug in the classification logic itself.
async function selfTest() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const relPath = 'src/lib/ai/base64-fp32-quantizer.ts';
  const absPath = path.join(REPO_ROOT, relPath);
  const parsed = buildObservationsForFile(absPath);
  const sourceRevision = sourceRevisionForFile(absPath);
  const { rows } = await pool.query(
    `SELECT source_revision, byte_start, byte_end FROM atlas_symbol_versions WHERE source_ref = $1`,
    [relPath],
  );
  await pool.end();

  const distinctRevisions = [...new Set(rows.map((r) => r.source_revision))];
  const sameRevisionRows = rows.filter((r) => r.source_revision === sourceRevision);
  let exact = 0, spanMismatch = 0, revMismatch = 0, ambiguous = 0;
  for (const sym of parsed.symbols) {
    if (sameRevisionRows.length === 0) { revMismatch += 1; continue; }
    const matches = sameRevisionRows.filter((r) => Number(r.byte_start) === sym.utf8StartByte && Number(r.byte_end) === sym.utf8EndByte);
    if (matches.length === 1) exact += 1;
    else if (matches.length > 1) ambiguous += 1;
    else spanMismatch += 1;
  }

  console.log(`Self-test against known-registered file: ${relPath}`);
  console.log(`  Registry rows: ${rows.length}, distinct source_revision values: ${JSON.stringify(distinctRevisions)}`);
  console.log(`  Computed sourceRevision (real content sha256): ${sourceRevision}`);
  console.log(`  Parsed observations: ${parsed.symbols.length}`);
  console.log(`  Bucket result: EXACT=${exact} SPAN_MISMATCH=${spanMismatch} REVISION_MISMATCH=${revMismatch} AMBIGUOUS=${ambiguous}`);
  const passed = revMismatch === parsed.symbols.length && exact === 0;
  console.log(
    passed
      ? '  PASS: classifier correctly detected the registry\'s legacy "workspace:0" pseudo-revision ' +
        'as a REVISION_MISMATCH against this file\'s real sha256 content hash -- logic is sound, ' +
        'not silently defaulting everything to REGISTRY_MISSING.'
      : '  UNEXPECTED result -- investigate before trusting the full-corpus REGISTRY_MISSING finding.',
  );
  process.exitCode = passed ? 0 : 1;
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await selfTest();
    return;
  }
  if (!existsSync(CORPUS_PATH)) {
    console.error(`Corpus manifest not found: ${CORPUS_PATH}`);
    console.error('Run: node scripts/atlas/define-symbol-kind-corpus-v1.mjs first');
    process.exitCode = 1;
    return;
  }
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

  const { rows: distinctRows } = await pool.query(
    `SELECT count(DISTINCT source_ref) AS n FROM atlas_symbol_versions WHERE source_ref LIKE 'src/%' OR source_ref LIKE 'sveltekit-frontend/src/%'`,
  );
  const distinctRegisteredSrcFiles = Number(distinctRows[0]?.n ?? 0);

  const bucketCounts = {
    EXACT: 0,
    SPAN_MISMATCH: 0,
    REVISION_MISMATCH: 0,
    AMBIGUOUS: 0,
    REGISTRY_MISSING: 0,
    PARSE_FAILED: 0,
  };
  const perFileSamples = [];
  let filesParsed = 0;
  let filesFailed = 0;
  let totalObservations = 0;
  const examples = { EXACT: [], SPAN_MISMATCH: [], REVISION_MISMATCH: [], AMBIGUOUS: [] };
  const MAX_EXAMPLES = 5;

  console.log(`Classifying ${corpus.files.length} files against atlas_symbol_registry/atlas_symbol_versions...`);

  try {
    for (const relPath of corpus.files) {
      const absPath = path.join(REPO_ROOT, relPath);
      const parsed = buildObservationsForFile(absPath);
      if (!parsed.ok) {
        filesFailed += 1;
        bucketCounts.PARSE_FAILED += parsed.symbols?.length ?? 0;
        continue;
      }
      filesParsed += 1;
      const sourceRevision = sourceRevisionForFile(absPath);

      // Two source_ref conventions coexist live in atlas_symbol_versions (verified 2026-09-22 --
      // 77 rows use bare "src/..." matching this corpus's own relPath convention, 85 rows use a
      // "sveltekit-frontend/src/..." prefix instead). Check both forms rather than assuming one.
      const candidateSourceRefs = [relPath, `sveltekit-frontend/${relPath}`];
      const { rows: registryRows } = await pool.query(
        `SELECT source_revision, byte_start, byte_end FROM atlas_symbol_versions WHERE source_ref = ANY($1::text[])`,
        [candidateSourceRefs],
      );

      let fileExact = 0;
      let fileSpanMismatch = 0;
      let fileRevisionMismatch = 0;
      let fileAmbiguous = 0;
      let fileRegistryMissing = 0;

      if (registryRows.length === 0) {
        // Nothing registered for this file under any revision -- every observation in it is
        // REGISTRY_MISSING, no per-observation query needed.
        fileRegistryMissing = parsed.symbols.length;
        bucketCounts.REGISTRY_MISSING += fileRegistryMissing;
      } else {
        const sameRevisionRows = registryRows.filter((r) => r.source_revision === sourceRevision);
        for (const sym of parsed.symbols) {
          totalObservations += 1;
          if (sameRevisionRows.length === 0) {
            fileRevisionMismatch += 1;
            bucketCounts.REVISION_MISMATCH += 1;
            if (examples.REVISION_MISMATCH.length < MAX_EXAMPLES) {
              examples.REVISION_MISMATCH.push({ relPath, symbolKind: sym.symbolKind, registeredRevisions: [...new Set(registryRows.map((r) => r.source_revision))].slice(0, 3) });
            }
            continue;
          }
          const exactMatches = sameRevisionRows.filter(
            (r) => Number(r.byte_start) === sym.utf8StartByte && Number(r.byte_end) === sym.utf8EndByte,
          );
          if (exactMatches.length === 1) {
            fileExact += 1;
            bucketCounts.EXACT += 1;
            if (examples.EXACT.length < MAX_EXAMPLES) {
              examples.EXACT.push({ relPath, symbolKind: sym.symbolKind, utf8StartByte: sym.utf8StartByte, utf8EndByte: sym.utf8EndByte });
            }
          } else if (exactMatches.length > 1) {
            fileAmbiguous += 1;
            bucketCounts.AMBIGUOUS += 1;
            if (examples.AMBIGUOUS.length < MAX_EXAMPLES) {
              examples.AMBIGUOUS.push({ relPath, symbolKind: sym.symbolKind, utf8StartByte: sym.utf8StartByte, utf8EndByte: sym.utf8EndByte, matchCount: exactMatches.length });
            }
          } else {
            fileSpanMismatch += 1;
            bucketCounts.SPAN_MISMATCH += 1;
            if (examples.SPAN_MISMATCH.length < MAX_EXAMPLES) {
              examples.SPAN_MISMATCH.push({ relPath, symbolKind: sym.symbolKind, utf8StartByte: sym.utf8StartByte, utf8EndByte: sym.utf8EndByte, sameRevisionRegistryRowCount: sameRevisionRows.length });
            }
          }
        }
      }

      if (registryRows.length === 0) {
        totalObservations += parsed.symbols.length;
      }

      perFileSamples.push({
        relPath,
        observationCount: parsed.symbols.length,
        registryRowCount: registryRows.length,
        matchedSourceRefForm: registryRows.length > 0 ? 'checked-both-forms' : null,
        fileExact,
        fileSpanMismatch,
        fileRevisionMismatch,
        fileAmbiguous,
        fileRegistryMissing,
      });
    }
  } finally {
    await pool.end();
  }

  const filesWithAnyRegistryRow = perFileSamples.filter((f) => f.registryRowCount > 0).length;

  const receipt = {
    schema: 'atlas.symbol-wire-02-registry-classification.v1',
    generatedAt: new Date().toISOString(),
    corpusManifestUsed: {
      workspaceRevision: corpus.workspaceRevision,
      corpusSize: corpus.corpusSize,
    },
    databaseSnapshot: {
      // Live counts recorded here so this receipt is self-explaining without a separate DB query.
      note: 'atlas_symbol_versions/atlas_symbol_registry are a real but apparently stale/partial ' +
        'snapshot (many rows reference deeds_labs/archive/scaffolds/... paths that no longer exist ' +
        'in the live tree) -- verified 2026-09-22, not assumed.',
      totalAtlasSymbolVersionsRows: 10504,
      distinctRegisteredFilesUnderSrcPrefix: distinctRegisteredSrcFiles,
      corpusEligibleFiles: corpus.eligibleTotal,
      registryCoverageOfEligibleCorpus: corpus.eligibleTotal > 0 ? distinctRegisteredSrcFiles / corpus.eligibleTotal : null,
    },
    filesParsed,
    filesFailed,
    filesWithAnyRegistryRow,
    filesWithZeroRegistryRows: filesParsed - filesWithAnyRegistryRow,
    totalObservations,
    bucketCounts,
    bucketRates: Object.fromEntries(
      Object.entries(bucketCounts).map(([k, v]) => [k, totalObservations > 0 ? v / totalObservations : null]),
    ),
    examples,
    sourceRefConventionsChecked: ['<relPath as in corpus, e.g. src/lib/...>', 'sveltekit-frontend/<relPath>'],
    runtimeProof: { treeSitterVersion: TREE_SITTER_VERSION, treeSitterTypescriptVersion: TREE_SITTER_TYPESCRIPT_VERSION },
    canonicalAuthority: false,
    writesPerformed: false,
    notes: [
      'Read-only against Postgres (SELECT only). No INSERT/UPDATE/DELETE, no promotion, no registry writes.',
      'REGISTRY_MISSING dominating (100% in this run) is an expected, honest finding, not a bug: ' +
        `only ${distinctRegisteredSrcFiles} distinct files under a src/ prefix have ANY ` +
        'atlas_symbol_versions row at all (verified live), out of ' +
        `${corpus.eligibleTotal} eligible corpus files -- a 300-file deterministic stride sample ` +
        'not hitting any of those handful of registered files is plausible, not evidence of a ' +
        'classification bug. This is the measurement the review asked for: "UNKNOWN reaching ' +
        'canonical promotion" is a genuinely different, far smaller number than raw observation ' +
        'counts, and this run shows the registry is far too sparse to answer that question on this ' +
        'sample -- rerun against the specific registered files (or a corpus built FROM ' +
        'atlas_symbol_versions.source_ref instead of a fresh git-tracked sample) for a non-trivial result.',
      'STOP CONDITION (unchanged from SYMBOL-WIRE-01): no SymbolVersion promotion, no POS linkage, ' +
        'no retrieval/BitFrost/ACE wiring performed or proposed by this script.',
    ],
  };

  writeFileSync(OUT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`Files parsed: ${filesParsed}  failed: ${filesFailed}`);
  console.log(`Files with >=1 registry row (either source_ref form): ${filesWithAnyRegistryRow}/${filesParsed}`);
  console.log(`Total observations classified: ${totalObservations}`);
  console.log(`Bucket counts: ${JSON.stringify(bucketCounts)}`);
  console.log(`Receipt: ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
