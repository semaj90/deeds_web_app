#!/usr/bin/env node
/**
 * Apply artifact-tier decisions to a metadata manifest.
 *
 * This script never moves, compresses, or deletes files. `--apply` writes the
 * reviewed classification manifest that later cold-storage tooling must honor.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, toPosixPath } from './_atlas-utils.mjs';

const APPLY = process.argv.includes('--apply');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const INPUT = path.join(REPORTS_DIR, 'artifact-bloat-report.json');
const OUT_JSON = path.join(REPORTS_DIR, 'artifact-tiering-application.json');
const OUT_MD = path.join(REPORTS_DIR, 'artifact-tiering-application.md');
const MANIFEST = path.join(REPO_ROOT, 'memory', 'exports', 'artifact-tiering-manifest.jsonl');

const RUNTIME_PROTECTED = new Map([
  ['models/gemma4-legal-iq4xs-direct.gguf', 'active llama-server chat model'],
  ['models/mmproj-F16.gguf', 'active VLM projection asset'],
  ['models/embeddinggemma-300m-f16.gguf', 'local embedding fallback'],
  ['models/embeddinggemma-300m-q8_0.gguf', 'local embedding fallback'],
  ['sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson', 'canonical vector export'],
  ['sveltekit-frontend/tmp/hypergraph/codebase_chunks_768-embeddings.ndjson', 'canonical hypergraph vector export'],
]);

function classify(item) {
  const relPath = toPosixPath(item.relPath);
  const lower = relPath.toLowerCase();
  const sizeMB = item.sizeBytes / 1048576;
  const protectedReason = RUNTIME_PROTECTED.get(relPath);

  if (protectedReason) {
    return {
      decision: 'keep_canonical',
      protected: true,
      reason: protectedReason,
    };
  }

  if (item.duplicate) {
    return {
      decision: 'delete_if_regenerable',
      protected: false,
      reason: 'content duplicate; deletion requires a retained canonical peer',
    };
  }

  if (lower === 'docs/reports/ignored-directory-audit.json'
    || lower === 'docs/reports/ignored-directory-audit.min.json') {
    return {
      decision: 'index_metadata_only',
      protected: false,
      reason: 'large local evidence; split Markdown summaries are the Git/index surface',
    };
  }

  if (item.kind === 'embedding_checkpoint' || item.kind === 'som_checkpoint') {
    return {
      decision: 'move_to_cold',
      protected: false,
      reason: 'model/checkpoint artifact; move only after manifest and restore verification',
    };
  }

  if (lower.startsWith('.tmp/') || lower.includes('/.tmp/') || lower.includes('/generated/')) {
    return {
      decision: sizeMB > 1 ? 'compress_zstd' : 'delete_if_regenerable',
      protected: false,
      reason: sizeMB > 1 ? 'large generated artifact' : 'small generated artifact',
    };
  }

  if (item.kind === 'duckdb' || item.kind === 'parquet' || item.kind === 'msgpack') {
    return {
      decision: sizeMB > 10 ? 'move_to_cold' : 'keep_canonical',
      protected: false,
      reason: sizeMB > 10 ? 'large structured snapshot' : 'compact structured index',
    };
  }

  if (item.kind === 'report' && sizeMB > 10) {
    return {
      decision: 'index_metadata_only',
      protected: false,
      reason: 'large report; retain compact summaries and source manifest',
    };
  }

  if ((item.kind === 'ndjson' || item.kind === 'raw_json') && sizeMB > 50) {
    return {
      decision: 'compress_zstd',
      protected: false,
      reason: 'large replayable data surface',
    };
  }

  return {
    decision: 'keep_canonical',
    protected: false,
    reason: 'small canonical or reviewable artifact',
  };
}

function summarize(rows) {
  const counts = {};
  const sizeMB = {};
  for (const row of rows) {
    counts[row.decision] = (counts[row.decision] ?? 0) + 1;
    sizeMB[row.decision] = (sizeMB[row.decision] ?? 0) + row.sizeBytes / 1048576;
  }
  return {
    counts,
    sizeMB: Object.fromEntries(
      Object.entries(sizeMB).map(([key, value]) => [key, Number(value.toFixed(2))]),
    ),
    protectedRuntimeArtifacts: rows.filter((row) => row.protected).length,
  };
}

async function main() {
  const audit = JSON.parse(await readFile(INPUT, 'utf8'));
  const rows = audit.artifacts.map((item) => {
    const classification = classify(item);
    return {
      path: item.relPath,
      kind: item.kind,
      sizeBytes: item.sizeBytes,
      sha256: item.sha256,
      ...classification,
      restoreRequired: ['move_to_cold', 'delete_if_regenerable'].includes(classification.decision),
      actionApplied: false,
    };
  });
  const summary = summarize(rows);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'MANIFEST_APPLIED' : 'DRY_RUN_READY',
    source: toPosixPath(path.relative(REPO_ROOT, INPUT)),
    policy: {
      destructiveActionsPerformed: false,
      coldMoveRequiresRestoreProof: true,
      deleteRequiresCanonicalPeer: true,
      activeRuntimeModelsProtected: true,
    },
    summary,
    rows,
  };

  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(
    OUT_MD,
    [
      '# Artifact Tiering Application',
      '',
      `Generated: ${report.generatedAt}`,
      `Mode: ${report.mode}`,
      '',
      'No file was moved, compressed, or deleted. This pass applies storage',
      'decisions to a manifest; destructive actions remain gated by restore proof.',
      '',
      '## Decisions',
      '',
      ...Object.entries(summary.counts).map(
        ([decision, count]) => `- ${decision}: ${count} files / ${summary.sizeMB[decision]} MB`,
      ),
      `- protected runtime artifacts: ${summary.protectedRuntimeArtifacts}`,
      '',
      '## Runtime Protections',
      '',
      ...rows.filter((row) => row.protected).map((row) => `- \`${row.path}\`: ${row.reason}`),
      '',
    ].join('\n'),
    'utf8',
  );

  if (APPLY) {
    await mkdir(path.dirname(MANIFEST), { recursive: true });
    await writeFile(MANIFEST, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    mode: report.mode,
    summary,
    report: toPosixPath(path.relative(REPO_ROOT, OUT_JSON)),
    manifest: APPLY ? toPosixPath(path.relative(REPO_ROOT, MANIFEST)) : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
