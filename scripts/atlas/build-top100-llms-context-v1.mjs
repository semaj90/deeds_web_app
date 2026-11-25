#!/usr/bin/env node
/**
 * Build a unified SvelteKit-2-style `llms.txt` context bundle (`top-100-llms-context-v1.txt`)
 * combining:
 *   - Top-10 active LLM context cards + Top-100 directory/file summaries (`codebase-atlas.dirs.json`)
 *   - Signed OBO+EG2 `LowRankHelperArtifactV1` helper recommendations
 *   - Latest `svelte-check-native` capture status
 *
 * Read-only on canonical stores; outputs only `sveltekit-frontend/memory/cards/top-100-llms-context-v1.txt`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRS_JSON = path.join(ROOT, 'sveltekit-frontend/memory/atlas/codebase-atlas.dirs.json');
const HELPER_ARTIFACT = path.join(ROOT, 'sveltekit-frontend/memory/atlas/low-rank-helper-artifact-v1.json');
const TOP100_CARDS = path.join(ROOT, 'sveltekit-frontend/memory/cards/top-100-codebase-summary-cards.json');
const SVELTE_CHECK_DIR = path.join(ROOT, '.tmp/atlas/svelte-check-runs');
const OUT_TXT = path.join(ROOT, 'sveltekit-frontend/memory/cards/top-100-llms-context-v1.txt');

const dirsDoc = JSON.parse(fs.readFileSync(DIRS_JSON, 'utf8'));
const helperArt = fs.existsSync(HELPER_ARTIFACT)
  ? JSON.parse(fs.readFileSync(HELPER_ARTIFACT, 'utf8'))
  : null;
const topCardsDoc = fs.existsSync(TOP100_CARDS)
  ? JSON.parse(fs.readFileSync(TOP100_CARDS, 'utf8'))
  : null;

let latestCheckSummary = null;
if (fs.existsSync(SVELTE_CHECK_DIR)) {
  const summaries = fs.readdirSync(SVELTE_CHECK_DIR).filter((f) => f.endsWith('.summary.json')).sort();
  if (summaries.length > 0) {
    latestCheckSummary = JSON.parse(
      fs.readFileSync(path.join(SVELTE_CHECK_DIR, summaries[summaries.length - 1]), 'utf8'),
    );
  }
}

const top100Dirs = (dirsDoc.cards ?? []).slice(0, 100);
const top10Dirs = top100Dirs.slice(0, 10);

const lines = [
  '# Parent Atlas — Top-100 Codebase & SvelteKit 2 Context (llms.txt)',
  '',
  `> Generated: ${new Date().toISOString()} · Total Directory Cards: ${dirsDoc.count ?? top100Dirs.length} · Canonical Authority: false`,
  `> Low-Rank Helper Artifact: ${helperArt?.artifactRevision ?? 'unavailable'} (rank=${helperArt?.rank ?? 0})`,
  `> Latest svelte-check-native Capture: errors=${latestCheckSummary?.errors ?? 'unknown'}, warnings=${latestCheckSummary?.warnings ?? 'unknown'}`,
  '',
  '## Top-10 High-Priority Directories (Active Context Tier)',
  '',
];

for (const [i, d] of top10Dirs.entries()) {
  lines.push(`### ${i + 1}. \`${d.d}\` (rank=${d.rank}, files=${d.n})`);
  lines.push(`- Domains: ${(d.topo ?? []).join(', ')}`);
  if ((d.tags ?? []).length > 0) lines.push(`- OBO Concepts: ${d.tags.slice(0, 6).join(', ')}`);
  if ((d.tools ?? []).length > 0) lines.push(`- MCP Tools: ${d.tools.slice(0, 5).join(', ')}`);
  lines.push(`- Top Files: ${(d.top ?? []).slice(0, 5).join(', ')}`);
  lines.push('');
}

lines.push('## Recommended Parent Atlas Helpers (`LowRankHelperArtifactV1`)', '');
for (const h of helperArt?.helperFactors ?? []) {
  lines.push(`- \`${h.helperId}\`: success=${h.successRate}, validation=${h.validationRate}, latency=${h.medianLatencyMs}ms, tokens=${h.medianContextTokens}`);
}
lines.push('');

lines.push('## Top-100 Directory Index (Compact Pool)', '');
for (const [i, d] of top100Dirs.entries()) {
  const topo = (d.topo ?? []).slice(0, 2).join('|') || 'core';
  const topFile = (d.top ?? [])[0] ?? '';
  lines.push(`${i + 1}. \`${d.d}\` [${topo}] rank=${d.rank} n=${d.n} -> ${topFile}`);
}

if (Array.isArray(topCardsDoc?.cards) && topCardsDoc.cards.length > 0) {
  lines.push('', '## Top-20 File Summary Cards', '');
  for (const [i, c] of topCardsDoc.cards.slice(0, 20).entries()) {
    lines.push(`${i + 1}. \`${c.source_ref ?? c.file_path ?? c.id}\` (${c.card_type ?? 'summary'}) — ${String(c.summary ?? '').slice(0, 140)}`);
  }
}

fs.mkdirSync(path.dirname(OUT_TXT), { recursive: true });
fs.writeFileSync(OUT_TXT, lines.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({
  schema: 'atlas.top100-llms-context.v1',
  outputPath: path.relative(ROOT, OUT_TXT).replaceAll('\\', '/'),
  bytes: fs.statSync(OUT_TXT).size,
  top100Dirs: top100Dirs.length,
  helperCount: helperArt?.helperFactors?.length ?? 0,
}, null, 2));
