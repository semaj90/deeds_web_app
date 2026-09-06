/** DOC-15 read-only owner audit; no retrieval calls or writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-15-retrieval-fanout-owner-v1.json');
const files = {
  hybridSearch: 'sveltekit-frontend/src/lib/server/search/hybrid-search.ts',
  qdrantSearch: 'sveltekit-frontend/src/lib/server/search/qdrant-search.ts',
  postgresFts: 'sveltekit-frontend/src/lib/server/search/postgres-fts.ts',
  retrievalOrchestrator: 'sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts',
  identityResolution: 'sveltekit-frontend/src/lib/server/retrieval/identity-resolution.ts',
};
const checks = [];
for (const [owner, relative] of Object.entries(files)) {
  const absolute = path.resolve(root, relative);
  let text = '';
  try { text = await fs.readFile(absolute, 'utf8'); } catch { /* report missing owner */ }
  checks.push({ owner, path: relative, present: Boolean(text), size: text.length });
}
const present = new Set(checks.filter((row) => row.present).map((row) => row.owner));
const report = {
  schema: 'atlas.doc-15-retrieval-fanout-owner-audit.v1',
  gate: 'DOC-15',
  status: present.has('hybridSearch') && present.has('qdrantSearch') && present.has('retrievalOrchestrator')
    ? 'DOC_15_OWNER_SURFACE_PRESENT'
    : 'DOC_15_OWNER_SURFACE_INCOMPLETE',
  owner: present.has('retrievalOrchestrator') ? 'existing retrieval orchestrator' : null,
  lanes: ['lexical', 'semantic_768', 'structural', 'graph', 'external_documentation'],
  checks,
  policy: {
    noSecondOrchestrator: true,
    noCanonicalWrites: true,
    qdrantIsProjection: true,
    searchRuntimeOwnsFusion: true,
    liveFanoutProven: false,
  },
  writesPerformed: false,
  nextGate: 'DOC_15_BOUNDED_SAME_QUERY_FANOUT_REPLAY',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'DOC_15_OWNER_SURFACE_PRESENT') process.exitCode = 1;
