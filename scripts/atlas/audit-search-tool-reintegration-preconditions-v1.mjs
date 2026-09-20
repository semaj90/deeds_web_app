#!/usr/bin/env node
/** Read-only SEARCH-REINTEGRATION-03 gate matrix. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const inputPath = path.join(root, 'docs/reports/search-tool-inventory-v1.json');
const reportPath = path.join(root, 'docs/reports/search-tool-reintegration-preconditions-v1.json');
const inventory = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const exists = (relative) => fs.existsSync(path.join(root, relative));
const source = (relative) => exists(relative) ? fs.readFileSync(path.join(root, relative), 'utf8') : '';

const searchRuntimeBoundary = [
  'sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts',
  'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
].find(exists) ?? null;
const deterministicTestFiles = [
  'sveltekit-frontend/src/lib/server/retrieval/analyze-this-coordinator.spec.ts',
  'sveltekit-frontend/src/lib/server/retrieval/structural-lane-retriever.spec.ts',
  'sveltekit-frontend/src/lib/server/retrieval/mcp-tool-viterbi-bridge-v1.spec.ts',
].filter(exists);
const qualityEvidenceFiles = fs.existsSync(path.join(root, 'docs/reports'))
  ? fs.readdirSync(path.join(root, 'docs/reports')).filter((name) => /qrels|retrieval.*quality|human.*quality/i.test(name))
  : [];

const rows = inventory.tools.map((tool) => {
  const handlerText = tool.handlerPaths.map(source).join('\n');
  const identityMentioned = /source[_A-Z]?revision|sourceRevision|workspace[_A-Z]?revision|workspaceRevision|packet[_A-Z]?key|packetKey/i.test(handlerText);
  const hasDeterministicTest = deterministicTestFiles.length > 0 && tool.family === 'trace-core';
  const laneSemantics = /lane|executor|retrieval|search|bifrost/i.test(`${tool.runtimeOwner} ${tool.outputContract}`);
  const callerMigrationEvidence = false;
  const qualityEvaluation = qualityEvidenceFiles.length > 0 && tool.family === 'trace-core';
  const conditions = {
    deterministicTests: hasDeterministicTest,
    canonicalIdentityAndRevisionPropagation: identityMentioned || tool.identityRequirement.includes('external evidence') || tool.identityRequirement.includes('ContextManifest'),
    oneSearchRuntimeOwnershipBoundary: Boolean(searchRuntimeBoundary),
    laneExecutorSemantics: laneSemantics,
    callerMigrationEvidence,
    qualityEvaluation,
  };
  const missing = Object.entries(conditions).filter(([, value]) => !value).map(([key]) => key);
  return {
    name: tool.name,
    disposition: tool.disposition,
    conditions,
    missingConditions: missing,
    restoreEligible: missing.length === 0,
    releaseEvidence: missing.length === 0 ? 'SEARCH_TOOL_REINTEGRATION_PRECONDITIONS_PROVEN' : 'SEARCH_TOOL_REINTEGRATION_PRECONDITIONS_INCOMPLETE',
    writesPerformed: false,
    canonicalAuthority: false,
  };
});

const report = {
  schema: 'atlas.search-tool-reintegration-preconditions.v1',
  gate: 'SEARCH-REINTEGRATION-03',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  inputReport: 'docs/reports/search-tool-inventory-v1.json',
  ownership: {
    searchRuntimeBoundary,
    deterministicTestFiles,
    qualityEvidenceFiles,
  },
  summary: {
    tools: rows.length,
    restoreEligible: rows.filter((row) => row.restoreEligible).length,
    blockedFromRestore: rows.filter((row) => !row.restoreEligible).length,
    missingByCondition: Object.fromEntries([...new Set(rows.flatMap((row) => row.missingConditions))].sort().map((key) => [key, rows.filter((row) => row.missingConditions.includes(key)).length])),
  },
  tools: rows,
  authority: {
    runtimeEnablementChanged: false,
    canonicalAuthorityChanged: false,
    writesPerformed: false,
    promotionAuthorized: false,
    restoreAttempted: false,
  },
  status: rows.every((row) => !row.restoreEligible) ? 'RESTORE_CLOSED_PRECONDITIONS_INCOMPLETE' : 'REVIEW_REQUIRED',
  nextGate: 'SEARCH-REINTEGRATION-04_NONDETERMINISTIC_SURFACE_AUDIT',
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, summary: report.summary, reportPath: 'docs/reports/search-tool-reintegration-preconditions-v1.json', writesPerformed: false }, null, 2));
