#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const DOCS_GRAPH = resolve(ROOT, 'docs/graph');

function safeJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

const gdsArtifact = safeJson(resolve(ROOT, 'memory/graphify/gds/latest.json'));
console.log('gdsArtifact null?', gdsArtifact === null);
if (gdsArtifact) {
  console.log('byPath keys:', gdsArtifact.byPath ? Object.keys(gdsArtifact.byPath).length : 'MISSING');
  console.log('allAuthorities:', gdsArtifact.allAuthorities?.length ?? 'MISSING');
}

const gdsAuthorityIndex = new Map();
const gdsNormPath = fp => (fp ?? '').replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/').replace(/^.*?\/sveltekit-frontend\//, '').replace(/^\//, '');
if (gdsArtifact) {
  if (gdsArtifact.byPath && typeof gdsArtifact.byPath === 'object') {
    for (const [key, entry] of Object.entries(gdsArtifact.byPath)) {
      if (key) gdsAuthorityIndex.set(key, { communityId: entry.communityId ?? null, graphAuthorityScore: entry.graphAuthorityScore ?? null });
    }
  }
}
console.log('gdsAuthorityIndex size:', gdsAuthorityIndex.size);

// Check NES nodes
const nesGraph = safeJson(resolve(DOCS_GRAPH, 'nes-glyph-architecture.json')) ?? {};
const nesNodes = nesGraph.nodes ?? [];
console.log('NES nodes:', nesNodes.length);

function nesFilePath(n) {
  if (n.file_path) return n.file_path;
  if (n.stableKey?.startsWith('file:')) return n.stableKey.slice(5);
  return n.id ?? n.label ?? null;
}

let hits = 0, total = 0;
for (const n of nesNodes.slice(0, 200)) {
  const fp = nesFilePath(n);
  if (!fp) continue;
  total++;
  const fpNorm = fp.replace(/^src\//, '');
  const stem = fpNorm.split('/').pop() ?? fpNorm;
  const gds = gdsAuthorityIndex.get(fp) ?? gdsAuthorityIndex.get(fpNorm) ?? gdsAuthorityIndex.get(stem) ?? null;
  if (gds?.graphAuthorityScore != null) hits++;
}
console.log(`Hits in first 200 nodes: ${hits}/${total}`);

// Sample a specific hit
const sampleKey = 'src/lib/server/db/client.ts';
console.log('Sample lookup', sampleKey, '->', gdsAuthorityIndex.get(sampleKey));