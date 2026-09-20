#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const outputPath = path.resolve(root, process.argv[2] ?? 'docs/reports/openwiki-review-input-boundary-v1.json');
const maxBytes = 512 * 1024;
const allowedRoots = [
  '.okf',
  'openspec/changes/parent-atlas-okf-knowledge-layers',
  'docs/architecture/okf-v02-validation-profile-v1.md',
  'docs/reports/okf-*.json',
];
const forbidden = [
  { rule: 'SECRETS', pattern: /(?:^|[\\/])(?:\.env(?:\.|$)|secrets?|credentials?)(?:[\\/]|$)/i },
  { rule: 'MODEL_BINARY', pattern: /\.(?:onnx|safetensors|gguf|pt|pth|bin|safetensors)$/i },
  { rule: 'RAW_VECTOR_OR_ARROW', pattern: /\.(?:npy|npz|arrow|feather|parquet|qdrant)$/i },
  { rule: 'UNBOUNDED_LOG', pattern: /(?:^|[\\/])(?:logs?|telemetry)(?:[\\/]|$)|\.(?:log|ndjson)$/i },
];

function sha256(buffer) { return `sha256:${createHash('sha256').update(buffer).digest('hex')}`; }
function walk(directory, result = []) {
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.tmp', 'dist', 'build'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, result);
    else result.push(absolute);
  }
  return result;
}

function matchesAllowed(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  return allowedRoots.some((rootPattern) => {
    if (rootPattern.includes('*')) return new RegExp(`^${rootPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*')}$`, 'i').test(normalized);
    return normalized === rootPattern || normalized.startsWith(`${rootPattern.replaceAll('\\', '/')}/`);
  });
}

const candidateSet = new Set();
for (const rootPattern of allowedRoots) {
  if (rootPattern.includes('*')) {
    const parent = path.resolve(root, rootPattern.slice(0, rootPattern.indexOf('*')));
    const suffix = rootPattern.slice(rootPattern.indexOf('*') + 1);
    const pattern = new RegExp(`^${suffix.replace(/[.+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    for (const file of walk(parent)) {
      if (pattern.test(path.basename(file))) candidateSet.add(file);
    }
  } else {
    const absolute = path.resolve(root, rootPattern);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      for (const file of walk(absolute)) candidateSet.add(file);
    } else if (fs.existsSync(absolute)) candidateSet.add(absolute);
  }
}
const candidates = [...candidateSet].filter((file) => matchesAllowed(path.relative(root, file)));
const eligible = [];
const excluded = [];
for (const file of candidates.sort()) {
  const relativePath = path.relative(root, file).replaceAll('\\', '/');
  const stat = fs.statSync(file);
  const forbiddenRule = forbidden.find(({ pattern }) => pattern.test(relativePath));
  if (forbiddenRule) {
    excluded.push({ path: relativePath, rule: forbiddenRule.rule });
    continue;
  }
  if (stat.size > maxBytes) {
    excluded.push({ path: relativePath, rule: 'SIZE_CAP_EXCEEDED', bytes: stat.size });
    continue;
  }
  const content = fs.readFileSync(file);
  eligible.push({ path: relativePath, bytes: stat.size, contentChecksum: sha256(content) });
}

const report = {
  schema: 'atlas.openwiki-review-input-boundary.v1',
  status: 'OPENWIKI_INPUT_BOUNDARY_PROVEN',
  generatedAt: new Date().toISOString(),
  outputBoundary: { generatedDirectory: 'openwiki-generated', reviewPage: 'openwiki-generated/parent-atlas-okf-review-v1.md', canonicalDocsDirectory: 'docs/okf/parent-atlas' },
  policy: { allowedRoots, maxBytes, forbiddenRules: forbidden.map(({ rule }) => rule), scansSecrets: false, scansRawVectors: false, scansUnboundedLogs: false },
  candidateCount: candidates.length,
  eligibleCount: eligible.length,
  excludedCount: excluded.length,
  eligible,
  excluded,
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
  openwikiRuntimeInvoked: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, status: report.status, candidateCount: report.candidateCount, eligibleCount: report.eligibleCount, excludedCount: report.excludedCount, openwikiRuntimeInvoked: false, writesPerformed: false, output: path.relative(root, outputPath) }, null, 2));
