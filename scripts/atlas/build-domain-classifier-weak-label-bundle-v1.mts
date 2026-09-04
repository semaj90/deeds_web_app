#!/usr/bin/env node
/**
 * DOMAIN-CLASSIFIER-WEAK-LABEL-BUNDLE-01
 * (openspec/changes/parent-atlas-search-classifier-sidecar, Next Steps item 2)
 *
 * Freezes the canonical TypeScript domain-taxonomy classifier's output for a bounded, sorted
 * file sample into a revisioned JSON artifact, so offline training in the Python sidecar's own
 * serving environment no longer depends on 300 live HTTP round-trips to a running SvelteKit dev
 * server. This does NOT create a second taxonomy owner: every weak label in this bundle comes
 * from calling classifyDomainTaxonomy() in-process (imported directly, not reimplemented) — the
 * bundle is a frozen snapshot of that function's outputs, not an independent classifier.
 *
 * classifyDomainTaxonomy() has zero imports of its own (verified: `grep '^import'` on
 * domain-taxonomy.ts returns nothing), so this script imports it via a plain relative path and
 * runs directly under tsx from the repo root — no SvelteKit $lib alias resolution needed (see
 * CLAUDE.md's "NPX Execution Context & Module Alias Resolution" section for why that matters for
 * most other server modules, and why this one is an exception).
 *
 * No datastore writes. Read-only against the source tree, single JSON file written at the end.
 *
 * Usage (from repo root):
 *   npx tsx scripts/atlas/build-domain-classifier-weak-label-bundle-v1.mts [--limit 300]
 *     [--corpus-dir sveltekit-frontend/src/lib/server] [--extensions .ts]
 *     [--output docs/reports/domain-classifier-weak-label-bundle-v1.json]
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyDomainTaxonomy,
  DOMAIN_TAXONOMY_VERSION,
} from '../../sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface CliArgs {
  corpusDir: string;
  limit: number;
  extensions: string[];
  output: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    corpusDir: 'sveltekit-frontend/src/lib/server',
    limit: 300,
    extensions: ['.ts'],
    output: 'docs/reports/domain-classifier-weak-label-bundle-v1.json',
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--corpus-dir') args.corpusDir = argv[++i];
    else if (flag === '--limit') args.limit = Number(argv[++i]);
    else if (flag === '--extensions') args.extensions = argv[++i].split(',');
    else if (flag === '--output') args.output = argv[++i];
  }
  return args;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/**
 * Deterministic, sorted, bounded corpus walk. Selection rule (documented verbatim in the
 * output artifact's `selectionRule` field, so a re-run's fileSetChecksum is reproducible):
 * recursively list every regular file under corpusDir whose extension is in `extensions`,
 * skip any path containing a `node_modules` segment, sort the full repo-root-relative paths
 * lexicographically (plain string sort, forward slashes), then take the first `limit`.
 */
async function walkCorpus(corpusDirAbs: string, extensions: string[]): Promise<string[]> {
  const results: string[] = [];
  async function recurse(dirAbs: string): Promise<void> {
    const entries = await readdir(dirAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const entryAbs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        await recurse(entryAbs);
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
        results.push(entryAbs);
      }
    }
  }
  await recurse(corpusDirAbs);
  return results
    .map((abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

interface BundleRow {
  sourceRef: string;
  contentChecksum: string;
  sourceRevision: string | null;
  sourceAuthorityStatus: 'PARTIAL' | 'RESOLVED';
  weakLabel: string;
  classificationConfidence: number;
  classifierVersion: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const corpusDirAbs = path.resolve(REPO_ROOT, args.corpusDir);
  const corpusStat = await stat(corpusDirAbs).catch(() => null);
  if (!corpusStat || !corpusStat.isDirectory()) {
    console.error(`ERROR: corpus dir does not exist: ${args.corpusDir}`);
    process.exit(1);
  }

  const allFiles = await walkCorpus(corpusDirAbs, args.extensions);
  const selected = allFiles.slice(0, args.limit);
  console.log(
    `Found ${allFiles.length} candidate files under ${args.corpusDir}; selecting first ${selected.length} (limit=${args.limit}).`,
  );

  const rows: BundleRow[] = [];
  let skippedNoLabel = 0;
  for (const sourceRef of selected) {
    const abs = path.resolve(REPO_ROOT, sourceRef);
    const content = await readFile(abs, 'utf8').catch(() => null);
    if (content === null) {
      console.warn(`  [warn] could not read ${sourceRef}, skipping`);
      continue;
    }
    const contentChecksum = sha256(content);
    const classification = classifyDomainTaxonomy({
      sourceRef,
      summary: content.slice(0, 4000),
    });

    // Matches train_domain_classifier.py::fetch_weak_label's semantics: only primary_domain
    // counts as a usable weak label. A fallback-only classification ('general') is an
    // abstention, not a label, and is excluded from the bundle rather than fabricated.
    if (!classification.primary_domain) {
      skippedNoLabel++;
      continue;
    }

    rows.push({
      sourceRef,
      contentChecksum,
      // No canonical source-revision resolution exists yet at this layer (no git-blob-hash or
      // workspace-revision lookup wired into classifyDomainTaxonomy's callers) — recording null
      // + PARTIAL rather than fabricating a value. If/when a real sourceRevision resolver exists,
      // wire it here and flip sourceAuthorityStatus to RESOLVED for rows it actually resolves.
      sourceRevision: null,
      sourceAuthorityStatus: 'PARTIAL',
      weakLabel: classification.primary_domain,
      classificationConfidence: classification.confidence,
      classifierVersion: classification.classifier_version,
    });
  }

  const fileSetChecksum = sha256(rows.map((r) => r.sourceRef).join('\n'));
  const labelSetChecksum = sha256(rows.map((r) => `${r.sourceRef}:${r.weakLabel}`).join('\n'));
  const labelDistribution: Record<string, number> = {};
  for (const row of rows) labelDistribution[row.weakLabel] = (labelDistribution[row.weakLabel] ?? 0) + 1;

  const bundle = {
    schema: 'atlas.domain-classifier-training-labels.v1',
    taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
    selectionRule:
      'sorted, repo-root-relative, recursive walk of corpusDir; files whose extension is in ' +
      'extensions; any path containing a node_modules segment excluded; first `limit` taken ' +
      'after sorting (plain lexicographic string sort on forward-slash paths).',
    corpusDir: args.corpusDir,
    extensions: args.extensions,
    limit: args.limit,
    candidateFileCount: allFiles.length,
    fileCount: rows.length,
    skippedNoLabelCount: skippedNoLabel,
    fileSetChecksum,
    labelSetChecksum,
    labelDistribution,
    generatedAt: new Date().toISOString(),
    rows,
  };

  const outputAbs = path.resolve(REPO_ROOT, args.output);
  await writeFile(outputAbs, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${rows.length} labeled rows (${skippedNoLabel} skipped, no usable primary_domain) to ${args.output}`,
  );
  console.log(`fileSetChecksum:  ${fileSetChecksum}`);
  console.log(`labelSetChecksum: ${labelSetChecksum}`);
  console.log(`labelDistribution:`, labelDistribution);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
