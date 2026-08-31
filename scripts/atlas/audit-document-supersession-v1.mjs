#!/usr/bin/env node
/**
 * Read-only census of explicit document supersession declarations.
 * Recency and filename similarity are deliberately ignored.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const registryPath = join(process.cwd(), 'docs', 'reports', 'document-governance-registry-v1.json');
const reportPath = join(process.cwd(), 'docs', 'reports', 'document-supersession-audit-v1.json');
const registryText = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : '';
const registry = registryText ? JSON.parse(registryText) : { records: [] };
const records = registry.records ?? [];
const knownPaths = new Set(records.map((record) => record.path));
const edges = [];
const unresolved = [];

function resolveTarget(target, fromPath) {
  const normalized = target.replaceAll('\\', '/').replace(/^\.\//, '');
  const repoMarker = '/deeds-web-app/';
  const markerIndex = normalized.indexOf(repoMarker);
  const candidates = [normalized];
  if (markerIndex >= 0) candidates.unshift(normalized.slice(markerIndex + repoMarker.length));
  if (normalized.startsWith('docs/')) candidates.push(`sveltekit-frontend/${normalized}`);
  if (fromPath.startsWith('openspec/changes/') && !normalized.startsWith('openspec/')) {
    candidates.push(`openspec/changes/${normalized}`);
  }
  for (const candidate of candidates) {
    if (knownPaths.has(candidate) || existsSync(resolve(process.cwd(), candidate))) {
      return { normalized: candidate, exists: true };
    }
  }
  return { normalized, exists: false };
}

for (const record of records) {
  // Generated search indexes and graph snapshots contain quoted historical
  // text; they are projections, not authored supersession declarations.
  if (/^docs\/(reports|archive|graph)\//.test(record.path) || /^docs\/(documents-atlas-index|documents-atlas-index)\.(md|json)$/.test(record.path)) continue;
  if (/^docs\/.*\.(json|jsonl)$/.test(record.path)) continue;
  const absolute = resolve(process.cwd(), record.path);
  if (!existsSync(absolute) || !/\.(md|json|ya?ml)$/i.test(record.path)) continue;
  const text = readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, lineNumber) => {
    if (!/supersed/i.test(line)) return;
    const candidates = line.match(/(?:[\w.-]+\/)+[\w./-]+\.(?:md|json|ya?ml)/g) ?? [];
    for (const target of candidates) {
      const resolvedTarget = resolveTarget(target, record.path);
      const ephemeral = !resolvedTarget.exists && resolvedTarget.normalized.startsWith('.tmp/');
      const edge = { from: record.path, to: resolvedTarget.normalized, line: lineNumber + 1, replacementExists: resolvedTarget.exists, ephemeral };
      edges.push(edge);
      if (!resolvedTarget.exists && !ephemeral) unresolved.push(edge);
    }
  });
}

const result = {
  schema: 'atlas.document.supersession.audit.v1',
  registryChecksum: registryText ? createHash('sha256').update(registryText).digest('hex') : null,
  status: unresolved.length ? 'BLOCKED' : 'PROVEN_BOUNDED',
  explicitEdges: edges.length,
  unresolvedReferences: unresolved.length,
  ephemeralReferences: edges.filter((edge) => edge.ephemeral).length,
  edges,
  writes: { documents: 0, archives: 0 },
  note: 'No supersession state was inferred or changed by this audit. Missing .tmp references are classified as ephemeral historical outputs and are not treated as replacement documents.',
};
writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(`${result.status} edges=${result.explicitEdges} unresolved=${result.unresolvedReferences}`);
console.log(`report=${reportPath}`);
process.exitCode = unresolved.length ? 2 : 0;
