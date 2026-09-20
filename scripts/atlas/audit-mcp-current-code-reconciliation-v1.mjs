#!/usr/bin/env node
/** Read-only SEARCH-REINTEGRATION-05 reconciliation. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/mcp-current-code-reconciliation-v1.json');
const readJson = (relative) => {
  const absolute = path.join(root, relative);
  return fs.existsSync(absolute) ? JSON.parse(fs.readFileSync(absolute, 'utf8')) : null;
};
const files = fs.readdirSync(path.join(root, 'sveltekit-frontend/src/mcp'))
  .filter((name) => /\.(?:ts|js|mjs)$/.test(name))
  .map((name) => path.join(root, 'sveltekit-frontend/src/mcp', name));
const declarations = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const regex = /registerTool\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(text))) {
    declarations.push({ name: match[1], file: path.relative(root, file).replaceAll('\\', '/'), offset: match.index });
  }
}
const byName = new Map();
for (const row of declarations) byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
const currentNames = new Set(byName.keys());
const inventory = readJson('docs/reports/search-tool-inventory-v1.json');
const trace = readJson('docs/reports/trace-disabled-search-tools-v1.json');
const ontology = readJson('docs/reports/mcp-tool-ontology.json');
const searchNames = new Set(inventory?.tools?.map((row) => row.name) ?? []);
const liveListNames = new Set(trace?.liveToolSchemaAudit?.filter((row) => row.live).map((row) => row.name) ?? []);
const liveReceiptScope = new Set(trace?.liveToolSchemaAudit?.map((row) => row.name) ?? []);
const liveListStatus = (name) => liveListNames.has(name)
  ? 'CURRENTLY_EXPOSED'
  : liveReceiptScope.has(name)
    ? 'OPTIONAL_OR_DISABLED'
    : 'NOT_IN_CURRENT_RECEIPT_SCOPE';
const handlerListMismatches = [...searchNames].map((name) => ({
  name,
  sourceRegistrationPresent: currentNames.has(name) || name === 'codebase.rg_search' || name === 'codebase.awk_analyze' || name === 'research.web_search' || name === 'research.synthesize' || name === 'research.deep_analyze' || name === 'trace.bifrost_dispatch',
  liveListPresent: liveListNames.has(name),
  status: liveListStatus(name),
}));
const ontologyRows = Array.isArray(ontology?.tools) ? ontology.tools : [];
const ontologyReconciliation = ontologyRows.map((row) => ({
  name: row.tool_name,
  ontologyClassification: Array.isArray(row.retrieval_layer) && row.retrieval_layer.includes('unknown') ? 'ONTOLOGY_UNKNOWN' : 'ONTOLOGY_CLASSIFIED',
  currentCodeRegistration: currentNames.has(row.tool_name),
  currentSearchInventory: searchNames.has(row.tool_name),
  status: currentNames.has(row.tool_name) ? 'CURRENT_CODE' : 'HISTORICAL_OR_EXTERNAL',
}));
const duplicateNames = [...byName.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([name, rows]) => ({
    name,
    count: rows.length,
    scope: new Set(rows.map((row) => row.file)).size > 1 ? 'CROSS_SERVER_OR_BUNDLE_DUPLICATE' : 'SAME_FILE_DUPLICATE',
    declarations: rows,
  }));
const report = {
  schema: 'atlas.mcp-current-code-reconciliation.v1',
  gate: 'SEARCH-REINTEGRATION-05',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  sources: {
    currentMcpDirectory: 'sveltekit-frontend/src/mcp',
    searchInventory: 'docs/reports/search-tool-inventory-v1.json',
    liveTraceReceipt: 'docs/reports/trace-disabled-search-tools-v1.json',
    historicalOntology: 'docs/reports/mcp-tool-ontology.json',
  },
  currentCode: {
    registeredToolDeclarations: declarations.length,
    uniqueToolNames: currentNames.size,
    duplicateNames,
  },
  searchSurface: {
    auditedTools: searchNames.size,
    handlerListMismatches,
    optionalOrDisabled: handlerListMismatches.filter((row) => row.status === 'OPTIONAL_OR_DISABLED').map((row) => row.name),
    outsideCurrentReceiptScope: handlerListMismatches.filter((row) => row.status === 'NOT_IN_CURRENT_RECEIPT_SCOPE').map((row) => row.name),
  },
  ontology: {
    historicalToolRows: ontologyRows.length,
    historicalUnknownCount: ontologyReconciliation.filter((row) => row.ontologyClassification === 'ONTOLOGY_UNKNOWN').length,
    currentCodeUnknownCount: ontologyReconciliation.filter((row) => row.ontologyClassification === 'ONTOLOGY_UNKNOWN' && row.currentCodeRegistration).length,
    historicalOrExternalCount: ontologyReconciliation.filter((row) => row.status === 'HISTORICAL_OR_EXTERNAL').length,
    rows: ontologyReconciliation,
  },
  authority: {
    runtimeEnablementChanged: false,
    canonicalAuthorityChanged: false,
    writesPerformed: false,
    promotionAuthorized: false,
  },
  status: duplicateNames.every((row) => row.scope === 'CROSS_SERVER_OR_BUNDLE_DUPLICATE') && handlerListMismatches.every((row) => row.sourceRegistrationPresent)
    ? 'CURRENT_CODE_RECONCILED_HISTORICAL_MISMATCHES_CLASSIFIED'
    : 'REVIEW_REQUIRED',
  nextGate: 'SEARCH-REINTEGRATION-06_NON_AUTHORIZING_AUDIT_SEMANTICS',
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, currentCode: report.currentCode, searchSurface: report.searchSurface, ontology: { historicalUnknownCount: report.ontology.historicalUnknownCount, currentCodeUnknownCount: report.ontology.currentCodeUnknownCount }, reportPath: 'docs/reports/mcp-current-code-reconciliation-v1.json', writesPerformed: false }, null, 2));
