#!/usr/bin/env node
/** Advisory-only classification of runtime cache writers. No owner is changed. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const inputPath = path.join(root, 'docs/reports/bitfrost-runtime-writer-review-v1.json');
const outputPath = path.join(root, 'docs/reports/bitfrost-runtime-writer-classification-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function classify(file) {
  const normalized = file.replaceAll('\\', '/');
  if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:spec|test)\.[^.]+$/i.test(normalized)) return 'TEST_OR_FIXTURE';
  if (/\/routes\/|\/mcp\/|\/dispatch\//i.test(normalized)) return 'ROUTE_OR_ADAPTER';
  if (/\/(?:ace|cache|memory|residency|tensor|rg-atlas|graph)\//i.test(normalized)
    || /(?:bitfrost|bifrost|centroid|som|gpu)/i.test(path.basename(normalized))) return 'RESIDENCY_SPECIALIZED';
  return 'UNKNOWN_REVIEW';
}

const classified = input.candidates.map((candidate) => ({
  ...candidate,
  classification: classify(candidate.file),
  authorityEffect: 'NAVIGATION_ONLY',
  automaticRepointing: false,
}));
const counts = Object.fromEntries([...classified.reduce((map, row) => {
  map.set(row.classification, (map.get(row.classification) ?? 0) + 1);
  return map;
}, new Map())].sort(([a], [b]) => a.localeCompare(b)));
const report = {
  schema: 'atlas.bitfrost-runtime-writer-classification.v1',
  generatedAt: new Date().toISOString(),
  inputReport: 'docs/reports/bitfrost-runtime-writer-review-v1.json',
  inputSemanticChecksum: input.semanticChecksum ?? null,
  policy: {
    readOnly: true,
    advisoryOnly: true,
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false,
    noAutomaticRepointing: true,
  },
  summary: { files: classified.length, byClassification: counts },
  classifications: classified,
  nextGate: 'MANUAL_REVIEW_RUNTIME_CACHE_WRITER_CLASSIFICATIONS',
};
report.semanticChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ ...report, semanticChecksum: undefined }), 'utf8').digest('hex')}`;
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: path.relative(root, outputPath), summary: report.summary, nextGate: report.nextGate, writesPerformed: false }));
