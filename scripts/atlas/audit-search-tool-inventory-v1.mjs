#!/usr/bin/env node
/**
 * Read-only SEARCH-REINTEGRATION-01 inventory.
 *
 * This is an inventory receipt, not a registry mutator. It records where each
 * search tool is declared, handled, exposed, referenced, and what identity
 * envelope is required before any future promotion.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/search-tool-inventory-v1.json');

const tools = [
  {
    name: 'kb.trace_search', family: 'trace-core',
    registryPaths: ['sveltekit-frontend/src/mcp/new_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/new_tools.ts', 'sveltekit-frontend/src/lib/server/ai/mcp-tool-dispatch.ts'],
    runtimeOwner: 'TRACE MCP retrieval boundary; canonical join-back required',
    inputContract: 'query:string, limit:1..20, intent?:string[]',
    outputContract: 'bounded retrieval hits; raw output is not model context',
    identityRequirement: 'sourceRef/sourceRevision/workspaceRevision/packetKey when packet-backed',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'Canonical join-back and current source-revision authority remain unproven.',
  },
  {
    name: 'trace.kag_search', family: 'trace-core',
    registryPaths: ['sveltekit-frontend/src/mcp/trace-mcp-server.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/trace-mcp-server.ts'],
    runtimeOwner: 'TRACE MCP; Go Retrieval first, SvelteKit/PostgreSQL fallback',
    inputContract: 'query:string, limit:1..50, topo_class?:string',
    outputContract: 'bounded KAG retrieval envelope with identity metadata required for promotion',
    identityRequirement: 'sourceRef/sourceRevision/workspaceRevision/packetKey when packet-backed',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'Retrieval boundary is usable for bounded reads but current lineage promotion is blocked.',
  },
  {
    name: 'codebase.rg_search', family: 'codebase',
    registryPaths: ['sveltekit-frontend/src/mcp/codebase_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/codebase_tools.ts'],
    runtimeOwner: 'SvelteKit MCP codebase tools via dispatcher middleware',
    inputContract: 'query:string, include?:string, contextLines?:number',
    outputContract: 'bounded diagnostic text; WORKTREE_DIAGNOSTIC unless admitted',
    identityRequirement: 'sourceRef/sourceRevision required before canonical promotion',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'Useful for dirty-worktree diagnostics; cannot establish canonical source authority.',
  },
  {
    name: 'codebase.awk_analyze', family: 'codebase',
    registryPaths: ['sveltekit-frontend/src/mcp/codebase_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/codebase_tools.ts'],
    runtimeOwner: 'SvelteKit MCP codebase tools via dispatcher middleware',
    inputContract: 'filePath:string, pattern:string, logic:string',
    outputContract: 'bounded diagnostic text; no canonical writes',
    identityRequirement: 'sourceRef/sourceRevision required before canonical promotion',
    disposition: 'KEEP_DISABLED',
    dispositionReason: 'Arbitrary AWK execution is not an admitted retrieval path.',
  },
  {
    name: 'research.web_search', family: 'research',
    registryPaths: ['sveltekit-frontend/src/mcp/research_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/research_tools.ts', 'sveltekit-frontend/src/lib/server/retrieval/web-search.ts'],
    runtimeOwner: 'SvelteKit MCP research adapter',
    inputContract: 'query:string, engines?:string, limit?:number',
    outputContract: 'provider/results text; external evidence, not canonical source authority',
    identityRequirement: 'external evidence refs; no packet identity implied',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'External research evidence remains downstream and non-canonical.',
  },
  {
    name: 'research.synthesize', family: 'research',
    registryPaths: ['sveltekit-frontend/src/mcp/research_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/research_tools.ts', 'sveltekit-frontend/src/lib/server/ai/llama-server-model-resolver.ts'],
    runtimeOwner: 'llama-server :8090; active model resolved at runtime',
    inputContract: 'query:string, case_id?:uuid, temperature?:number, max_tokens?:number, skip_cache?:boolean',
    outputContract: 'answer/usage metadata; synthesis is downstream of canonical ACE context',
    identityRequirement: 'ContextManifest/PromptPlan identity required; no raw search injection',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'Synthesis is downstream of canonicalized ACE context and llama-server ownership.',
  },
  {
    name: 'research.deep_analyze', family: 'research',
    registryPaths: ['sveltekit-frontend/src/mcp/research_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/research_tools.ts'],
    runtimeOwner: 'SvelteKit MCP research adapter and llama-server synthesis boundary',
    inputContract: "topic:string, depth?:'standard'|'exhaustive'",
    outputContract: 'bounded multi-query research summary; no canonical writes',
    identityRequirement: 'evidence refs required for any downstream claim',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'Multi-query orchestration is not a source or retrieval authority.',
  },
  {
    name: 'trace.bifrost_dispatch', family: 'bifrost',
    registryPaths: ['sveltekit-frontend/src/mcp/bifrost_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/bifrost_tools.ts'],
    runtimeOwner: 'Bifrost routing adapter; Ollama embedding-only, llama-server chat-only',
    inputContract: "tier:'EMBED'|'RERANK'|'GENERATE_FAST'|'GENERATE_LONG', payload:record",
    outputContract: 'provider response; executor receipt required before promotion',
    identityRequirement: 'representation/executor/model revision and checksums required',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'Bifrost routes providers but does not own canonical identity or executor promotion.',
  },
  {
    name: 'kb.rg_atlas_search', family: 'rg-atlas',
    registryPaths: ['sveltekit-frontend/src/mcp/rg_atlas_tools.ts'],
    handlerPaths: ['sveltekit-frontend/src/mcp/rg_atlas_tools.ts', 'sveltekit-frontend/src/lib/server/rg-atlas/run.ts'],
    runtimeOwner: 'RG-Atlas adapter via runRgSearchAtlas',
    inputContract: 'rgSearchAtlasOptionsSchema',
    outputContract: 'runId/topHits/diagnostics; navigation or retrieval projection only',
    identityRequirement: 'sourceRef/sourceRevision/workspaceRevision required for canonical promotion',
    disposition: 'ADAPTER_ONLY',
    dispositionReason: 'RG-Atlas is a bounded adapter/projection and cannot promote lineage.',
  },
];

function filesUnder(relativeRoot) {
  const start = path.join(root, relativeRoot);
  const result = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'build', '.svelte-kit'].includes(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx|js|mjs|mts)$/.test(entry.name)) result.push(absolute);
    }
  };
  visit(start);
  return result;
}

const sourceFiles = filesUnder('sveltekit-frontend/src');
const read = (relative) => {
  const absolute = path.join(root, relative);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
};
const relative = (absolute) => path.relative(root, absolute).replaceAll('\\', '/');
const count = (source, value) => source.split(value).length - 1;

const inventory = tools.map((tool) => {
  const callerFiles = sourceFiles
    .filter((file) => count(fs.readFileSync(file, 'utf8'), tool.name) > 0)
    .map(relative)
    .sort();
  const ontologyRegistrationFiles = callerFiles.filter((file) => /tool-selection|tool-ranker|intent-router|tool-definitions|authorization|registry|ontology/i.test(file));
  const registryEntryPresent = tool.registryPaths.some((file) => {
    const source = read(file);
    return count(source, `'${tool.name}'`) > 0 || count(source, `"${tool.name}"`) > 0;
  });
  const liveExposure = callerFiles.some((file) => /server|new_tools|trace-mcp-server|codebase_tools|research_tools|bifrost_tools|rg_atlas_tools/.test(file));
  return {
    ...tool,
    registryEntryPresent,
    liveListExposure: liveExposure,
    callerFiles,
    callerCount: callerFiles.length,
    ontologyRegistrationFiles,
    ontologyRegistrationObserved: ontologyRegistrationFiles.length > 0,
    canonicalAuthority: false,
    runtimeEnablementChanged: false,
    writesPerformed: false,
  };
});

const summary = {
  totalTools: inventory.length,
  registryMapped: inventory.filter((row) => row.registryEntryPresent).length,
  handlerMapped: inventory.filter((row) => row.handlerPaths.length > 0).length,
  contractMapped: inventory.filter((row) => row.inputContract && row.outputContract).length,
  callerInventoried: inventory.filter((row) => row.callerCount > 0).length,
  ontologyObserved: inventory.filter((row) => row.ontologyRegistrationObserved).length,
  liveExposed: inventory.filter((row) => row.liveListExposure).length,
};
const dispositions = ['RESTORE', 'ADAPTER_ONLY', 'SUPERSEDED', 'KEEP_DISABLED', 'REMOVE_AFTER_CALLER_ZERO'];
const dispositionAudit = {
  allowed: dispositions,
  everyToolClassified: inventory.every((row) => dispositions.includes(row.disposition)),
  counts: Object.fromEntries(dispositions.map((value) => [value, inventory.filter((row) => row.disposition === value).length])),
  noRestoreClaimed: inventory.every((row) => row.disposition !== 'RESTORE'),
};

const report = {
  schema: 'atlas.search-tool-inventory.v1',
  gate: 'SEARCH-REINTEGRATION-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status: summary.registryMapped === summary.totalTools && summary.handlerMapped === summary.totalTools && summary.contractMapped === summary.totalTools
    ? 'INVENTORY_PROVEN_READ_ONLY'
    : 'INVENTORY_INCOMPLETE',
  summary,
  dispositionAudit,
  tools: inventory,
  authority: {
    runtimeEnablementChanged: false,
    canonicalAuthorityChanged: false,
    writesPerformed: false,
    promotionAuthorized: false,
    note: 'Inventory and caller evidence do not enable, disable, or promote any search surface.',
  },
  nextGate: 'SEARCH-REINTEGRATION-03_REINTEGRATION_PRECONDITIONS',
};
report.evidenceChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ ...report, generatedAt: undefined }), 'utf8').digest('hex')}`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, summary, reportPath: 'docs/reports/search-tool-inventory-v1.json', writesPerformed: false }, null, 2));
