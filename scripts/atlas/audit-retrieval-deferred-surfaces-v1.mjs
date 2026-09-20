#!/usr/bin/env node
/** Read-only disposition receipt for explicitly parked retrieval surfaces. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/retrieval-deferred-surfaces-v1.json');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const surfaces = [
  {
    task: 'DEFER-TRACE-MCP-01',
    surface: 'TRACE_MCP_EXPANSION',
    evidence: ['scripts/atlas/audit-trace-disabled-search-tools-v1.mjs', 'docs/reports/trace-disabled-search-tools-v1.json'],
    disposition: 'DEFERRED_NON_BLOCKING',
    releaseWhen: 'retrieval profile/ranking/pagination ownership is closed',
  },
  {
    task: 'DEFER-VIBRETI-01',
    surface: 'HMM_VIBRETI_REPAIR_CHALLENGER',
    evidence: ['sveltekit-frontend/src/lib/server/retrieval/hmm-tool-selector.ts', 'sveltekit-frontend/src/lib/server/retrieval/mcp-tool-viterbi-bridge-v1.ts'],
    disposition: 'CHALLENGER_ONLY',
    releaseWhen: 'deterministic retrieval owner and evaluation explicitly admit this lane',
  },
  {
    task: 'DEFER-QUERY-NLP-01',
    surface: 'QUERY_NLP_SIDECAR_EXPANSION',
    evidence: ['sveltekit-frontend/src/lib/server/retrieval/analyze-this-coordinator.ts'],
    disposition: 'DEFERRED_NON_BLOCKING',
    releaseWhen: 'new query-sidecar endpoint has an explicit owner and evidence contract',
  },
];
const rows = surfaces.map((surface) => ({
  ...surface,
  evidencePresent: surface.evidence.filter(exists),
  evidenceComplete: surface.evidence.every(exists),
  canonicalAuthority: false,
  writesPerformed: false,
}));
const report = {
  schema: 'atlas.retrieval-deferred-surfaces.v1',
  gate: 'DEFERRED_RETRIEVAL_SURFACES',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status: rows.every((row) => row.evidenceComplete) ? 'DEFERRED_SURFACES_PROVEN' : 'DEFERRED_EVIDENCE_INCOMPLETE',
  rows,
  authority: { runtimeEnablementChanged: false, canonicalAuthorityChanged: false, writesPerformed: false, promotionAuthorized: false },
  nextGate: 'RETRIEVAL_OWNERSHIP_01',
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, rows: rows.map(({ task, disposition, evidenceComplete }) => ({ task, disposition, evidenceComplete })), reportPath: 'docs/reports/retrieval-deferred-surfaces-v1.json', writesPerformed: false }, null, 2));
