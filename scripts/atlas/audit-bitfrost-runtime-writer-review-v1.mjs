#!/usr/bin/env node
/**
 * Bounded follow-up to the cache writer census. It does not rescan the tree or
 * change cache code; it isolates runtime writers that need canonical-builder
 * review from historical/script-only noise.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const inputPath = path.join(root, 'docs/reports/bitfrost-cache-writer-census-v1.json');
const outputPath = path.join(root, 'docs/reports/bitfrost-runtime-writer-review-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const runtime = (input.writerCensus ?? []).filter((entry) => entry.lane === 'RUNTIME');
const withoutBuilder = runtime.filter((entry) => entry.canonicalBuilderImported !== true);
const by = (rows, key) => Object.fromEntries([...rows.reduce((map, row) => {
  const value = row[key] ?? 'UNKNOWN';
  map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}, new Map())].sort(([a], [b]) => a.localeCompare(b)));
const files = [...new Set(withoutBuilder.map((entry) => entry.file))].sort();
const report = {
  schema: 'atlas.bitfrost-runtime-writer-review.v1',
  generatedAt: new Date().toISOString(),
  inputReport: 'docs/reports/bitfrost-cache-writer-census-v1.json',
  inputSemanticChecksum: input.semanticChecksum ?? null,
  policy: {
    readOnly: true,
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false,
    historicalAndScriptOnlyExcluded: true,
    noAutomaticRepointing: true,
  },
  summary: {
    runtimeWriterOccurrences: runtime.length,
    runtimeWriterOccurrencesUsingCanonicalBuilder: runtime.length - withoutBuilder.length,
    runtimeWriterOccurrencesWithoutCanonicalBuilder: withoutBuilder.length,
    filesRequiringReview: files.length,
  },
  byPrefix: by(withoutBuilder, 'prefix'),
  byFile: by(withoutBuilder, 'file'),
  candidates: files.map((file) => ({
    file,
    occurrences: withoutBuilder.filter((entry) => entry.file === file).length,
    prefixes: [...new Set(withoutBuilder.filter((entry) => entry.file === file).map((entry) => entry.prefix))].sort(),
    activeCandidate: withoutBuilder.some((entry) => entry.file === file && entry.activeCandidate === true),
    classification: 'REVIEW_REQUIRED',
  })),
  nextGate: files.length ? 'REVIEW_RUNTIME_WRITERS_WITHOUT_CANONICAL_BUILDER' : 'RUNTIME_CACHE_WRITERS_ALIGNED',
};
report.semanticChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ ...report, semanticChecksum: undefined }), 'utf8').digest('hex')}`;
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: path.relative(root, outputPath), summary: report.summary, nextGate: report.nextGate, writesPerformed: false }));
