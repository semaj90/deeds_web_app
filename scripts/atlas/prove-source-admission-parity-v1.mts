#!/usr/bin/env tsx
/** Read-only Git/scanner/manifest admission oracle for representative paths. */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from '../../packages/parent-atlas-ingest/src/scanner/directory-scanner.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = path.join(ROOT, '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl');
const REPORT = path.join(ROOT, 'docs/reports/source-admission-parity-v1.json');
const paths = [
  'packages/parent-atlas/src/core/compute-dag-policy.ts',
  'packages/parent-atlas/src/core/ace-synthesis-graph.ts',
  'crates/atlas_packet_parser/src/lib.rs',
  'gsd_archives/phase-2f1-baseline/schema-backup/admin-chat.ts',
  'sveltekit-frontend/models/naive-bayes-rejected-errors.json',
  'memory/atlas/documents-atlas.latest.md',
];

function normalized(value: string): string {
  return value.replaceAll('\\', '/');
}

function gitIgnored(relativePath: string): { ignored: boolean; matchingRule: string | null } {
  try {
    const matchingRule = execFileSync('git', ['check-ignore', '-v', '--no-index', '--', relativePath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const rule = matchingRule.split('\t', 1)[0].split(':').slice(2).join(':');
    // git check-ignore also reports a matching negation rule. That means the
    // path is explicitly re-included, not ignored.
    return { ignored: !rule.startsWith('!'), matchingRule: matchingRule || null };
  } catch {
    return { ignored: false, matchingRule: null };
  }
}

const manifestRows = (await readFile(MANIFEST, 'utf8'))
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as {
    relativePath: string; status?: string; canonicalAdmission?: boolean;
  });
const manifestByPath = new Map(manifestRows.map((row) => [normalized(row.relativePath), row]));
const scannerPaths = new Set<string>();
for await (const file of scanDirectory({ rootPath: ROOT, gitIgnoreMode: 'strict' })) {
  scannerPaths.add(normalized(file.relativePath));
}

const observations = paths.map((relativePath) => {
  const git = gitIgnored(relativePath);
  const scannerAdmits = scannerPaths.has(relativePath);
  const manifestRow = manifestByPath.get(relativePath);
  const manifestAdmits = manifestRow?.status === 'HASHED' && manifestRow.canonicalAdmission === true;
  let classification = 'EXACT';
  if (scannerAdmits !== manifestAdmits) classification = 'SCANNER_MANIFEST_DRIFT';
  else if (git.ignored !== !scannerAdmits) classification = 'CANONICAL_SCOPE_EXCLUDES_GIT_VISIBLE';
  return {
    path: relativePath,
    git: { ignored: git.ignored, matchingRule: git.matchingRule },
    scanner: { admitted: scannerAdmits },
    manifest: { admitted: manifestAdmits, status: manifestRow?.status ?? 'ABSENT' },
    classification,
  };
});

const counts = Object.fromEntries([...new Set(observations.map((item) => item.classification))]
  .sort().map((key) => [key, observations.filter((item) => item.classification === key).length]));
const report = {
  schema: 'atlas.source-admission-parity-receipt.v1',
  readOnly: true,
  writesPerformed: false,
  gitOracle: 'git check-ignore --no-index',
  scanner: 'packages/parent-atlas-ingest/src/scanner/directory-scanner.ts',
  manifest: '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl',
  counts,
  observations,
};
await mkdir(path.dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, report: path.relative(ROOT, REPORT).replaceAll('\\', '/') }, null, 2));
