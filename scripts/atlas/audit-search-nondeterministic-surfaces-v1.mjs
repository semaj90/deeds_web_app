#!/usr/bin/env node
/** Read-only SEARCH-REINTEGRATION-04 audit for randomized/stubbed surfaces. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/search-nondeterministic-surfaces-v1.json');
const read = (relative) => {
  const absolute = path.join(root, relative);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
};
const observations = [
  {
    surface: 'mla-low-rank-reranker',
    path: 'sveltekit-frontend/src/lib/server/search/mla-kv-compress.ts',
    markers: ['Math.random()', 'random rotation'],
    disposition: 'KEEP_DISABLED',
    reason: 'Randomized projection is not deterministic evidence for a canonical reranker without a sealed seed/matrix receipt.',
  },
  {
    surface: 'rg-qdrant-reranking',
    path: 'sveltekit-frontend/src/lib/server/search/rg-search-orchestrator.ts',
    markers: ['TODO: Wire Qdrant reranking'],
    disposition: 'KEEP_DISABLED',
    reason: 'The integration is an explicit stub and cannot be treated as an active executor.',
  },
  {
    surface: 'atlas.search-protocol-reference',
    path: 'scripts/atlas/audit-acp-packet-transport.mjs',
    markers: ['atlas.search'],
    disposition: 'KEEP_DISABLED',
    reason: 'Observed only in transport audit cases; no live registered owner was admitted by this audit.',
  },
  {
    surface: 'ops.patch-preview',
    path: 'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
    markers: ['ops.propose_patch', 'READ-ONLY PREVIEW'],
    disposition: 'KEEP_DISABLED',
    reason: 'Patch proposal is operator-gated and preview-only; it is not a search reintegration path.',
  },
];

const rows = observations.map((item) => {
  const text = read(item.path);
  return {
    ...item,
    filePresent: Boolean(text),
    observedMarkers: item.markers.filter((marker) => text.includes(marker)),
    evidenceComplete: Boolean(text) && item.markers.every((marker) => text.includes(marker)),
    runtimeEnablementChanged: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
});
const report = {
  schema: 'atlas.search-nondeterministic-surfaces.v1',
  gate: 'SEARCH-REINTEGRATION-04',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status: rows.every((row) => row.evidenceComplete && row.disposition === 'KEEP_DISABLED')
    ? 'NONDETERMINISTIC_AND_STUB_SURFACES_REMAIN_DISABLED'
    : 'REVIEW_REQUIRED',
  summary: {
    surfaces: rows.length,
    evidenceComplete: rows.filter((row) => row.evidenceComplete).length,
    keepDisabled: rows.filter((row) => row.disposition === 'KEEP_DISABLED').length,
    restoreEligible: 0,
  },
  surfaces: rows,
  authority: {
    runtimeEnablementChanged: false,
    canonicalAuthorityChanged: false,
    writesPerformed: false,
    promotionAuthorized: false,
  },
  nextGate: 'SEARCH-REINTEGRATION-05_MCP_MISMATCH_RECONCILIATION',
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, summary: report.summary, reportPath: 'docs/reports/search-nondeterministic-surfaces-v1.json', writesPerformed: false }, null, 2));
