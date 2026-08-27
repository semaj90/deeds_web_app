#!/usr/bin/env tsx
/**
 * Read-only comparison of the real directory scanner and the source manifest.
 * This audits admission policy only; it does not read or write any service.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from '../../packages/parent-atlas-ingest/src/scanner/directory-scanner.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(ROOT, '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl');
const reportPath = path.join(ROOT, 'docs/reports/replay-semantic-admission-v1.json');

function normalize(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

const SCANNER_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs']);

function isScannerComparable(relativePath: string): boolean {
  return SCANNER_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

async function main(): Promise<void> {
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifestRows = manifestText.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as {
    relativePath: string;
    status?: string;
    canonicalAdmission?: boolean;
    sourceRootAuthority?: string;
  });
  const manifestReport = JSON.parse(await readFile(
    path.join(ROOT, 'docs/reports/indexable-source-manifest-v1.json'),
    'utf8',
  )) as { sampleLimit?: number };

  const scanned = new Set<string>();
  for await (const file of scanDirectory({ rootPath: ROOT, gitIgnoreMode: 'strict' })) {
    scanned.add(normalize(file.relativePath));
  }

  const manifestByPath = new Map(
    manifestRows
      .filter((row) => isScannerComparable(row.relativePath))
      .map((row) => [normalize(row.relativePath), row]),
  );
  const manifestEligible = new Set(
      manifestRows
      .filter((row) => isScannerComparable(row.relativePath))
      .filter((row) => row.status === 'HASHED' && row.canonicalAdmission === true)
      .map((row) => normalize(row.relativePath)),
  );

  let admittedByBoth = 0;
  let replayOnlyEligible = 0;
  let indexerOnlyEligible = 0;
  let excludedByBoth = 0;
  const replayOnlyPaths: string[] = [];
  const indexerOnlyPaths: string[] = [];
  const replayOnlyByExtension = new Map<string, number>();
  const indexerOnlyByExtension = new Map<string, number>();
  for (const relativePath of new Set([...manifestByPath.keys(), ...scanned])) {
    const manifestAdmits = manifestEligible.has(relativePath);
    const indexerAdmits = scanned.has(relativePath);
    if (manifestAdmits && indexerAdmits) admittedByBoth += 1;
    else if (manifestAdmits) {
      replayOnlyEligible += 1;
      if (replayOnlyPaths.length < 25) replayOnlyPaths.push(relativePath);
      const extension = path.extname(relativePath).toLowerCase() || '<none>';
      replayOnlyByExtension.set(extension, (replayOnlyByExtension.get(extension) || 0) + 1);
    }
    else if (indexerAdmits) {
      indexerOnlyEligible += 1;
      if (indexerOnlyPaths.length < 25) indexerOnlyPaths.push(relativePath);
      const extension = path.extname(relativePath).toLowerCase() || '<none>';
      indexerOnlyByExtension.set(extension, (indexerOnlyByExtension.get(extension) || 0) + 1);
    }
    else excludedByBoth += 1;
  }

  const report = {
    schema: 'atlas.replay-semantic-admission.v1',
    readOnly: true,
    writesPerformed: false,
    workspaceRoot: ROOT,
    manifestPath: path.relative(ROOT, manifestPath).replaceAll('\\', '/'),
    manifestRowCount: manifestRows.length,
    comparableManifestRowCount: manifestByPath.size,
    manifestIsBounded: typeof manifestReport.sampleLimit === 'number'
      ? manifestRows.length >= manifestReport.sampleLimit
      : true,
    actualScannerFileCount: scanned.size,
    policy: {
      manifest: 'preview-indexable-source-manifest-v1',
      indexer: 'packages/parent-atlas-ingest/src/scanner/directory-scanner.ts',
      gitIgnoreMode: 'strict',
    },
    counts: {
      admittedByBoth,
      replayOnlyEligible,
      indexerOnlyEligible,
      excludedByBoth,
    },
    mismatchSamples: {
      replayOnlyPaths,
      indexerOnlyPaths,
      replayOnlyByExtension: Object.fromEntries([...replayOnlyByExtension.entries()].sort()),
      indexerOnlyByExtension: Object.fromEntries([...indexerOnlyByExtension.entries()].sort()),
    },
    classification: replayOnlyEligible === 0 && indexerOnlyEligible === 0
      ? 'ADMISSION_EQUIVALENT_FOR_COMPARABLE_SCOPE'
      : 'ADMISSION_POLICY_DRIFT_OR_SCOPE_MISMATCH',
    limitations: (typeof manifestReport.sampleLimit === 'number' && manifestRows.length >= manifestReport.sampleLimit)
      ? ['The manifest is bounded; rerun preview with a limit covering the full admitted corpus before treating this as a corpus-wide proof.']
      : [],
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
}

await main();
