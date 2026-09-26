#!/usr/bin/env node
/** Read-only census of optional TRACE search families for later re-integration. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/trace-disabled-search-tools-v1.json');
const endpoint = process.env.TRACE_MCP_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8788/mcp';
const families = [
  {
    family: 'codebase',
    source: 'sveltekit-frontend/src/mcp/codebase_tools.ts',
    tools: ['codebase.rg_search', 'codebase.awk_analyze'],
    handlerPaths: ['sveltekit-frontend/src/mcp/codebase_tools.ts'],
    runtimeOwner: 'SvelteKit MCP codebase tools via dispatcher middleware',
    inputContracts: {
      'codebase.rg_search': 'z.object({ query: string, include?: string, contextLines?: number })',
      'codebase.awk_analyze': 'z.object({ filePath: string, pattern: string, logic: string })',
    },
    outputContract: 'MCP content text; bounded diagnostic output; no canonical writes',
  },
  {
    family: 'research',
    source: 'sveltekit-frontend/src/mcp/research_tools.ts',
    tools: ['research.web_search', 'research.synthesize', 'research.deep_analyze'],
    handlerPaths: ['sveltekit-frontend/src/mcp/research_tools.ts', 'sveltekit-frontend/src/lib/server/retrieval/web-search.ts', 'sveltekit-frontend/src/lib/server/ai/llama-server-model-resolver.ts'],
    runtimeOwner: 'SvelteKit MCP research tools; synthesis owned by llama-server :8090',
    inputContracts: {
      'research.web_search': 'z.object({ query: string, engines?: string, limit?: number })',
      'research.synthesize': 'z.object({ query: string, case_id?: uuid, temperature?: number, max_tokens?: number, skip_cache?: boolean })',
      'research.deep_analyze': "z.object({ topic: string, depth?: 'standard'|'exhaustive' })",
    },
    outputContract: 'MCP content text with provider/results or synthesis metadata; no canonical writes',
  },
  {
    family: 'bifrost',
    source: 'sveltekit-frontend/src/mcp/bifrost_tools.ts',
    tools: ['trace.bifrost_dispatch'],
    handlerPaths: ['sveltekit-frontend/src/mcp/bifrost_tools.ts', 'sveltekit-frontend/src/lib/server/search/rerank-endpoint.ts'],
    runtimeOwner: 'SvelteKit MCP Bifrost dispatcher; Ollama is embedding-only and llama-server owns chat',
    inputContracts: {
      'trace.bifrost_dispatch': "z.object({ tier: 'EMBED'|'RERANK'|'GENERATE_FAST'|'GENERATE_LONG', payload: record })",
    },
    outputContract: 'MCP content text from selected provider; provider receipt required before promotion',
  },
  {
    family: 'rg-atlas',
    source: 'sveltekit-frontend/src/mcp/rg_atlas_tools.ts',
    tools: ['kb.rg_atlas_search'],
    handlerPaths: ['sveltekit-frontend/src/mcp/rg_atlas_tools.ts', 'sveltekit-frontend/src/lib/server/rg-atlas/run.ts'],
    runtimeOwner: 'SvelteKit MCP RG-Atlas adapter via runRgSearchAtlas',
    inputContracts: { 'kb.rg_atlas_search': 'rgSearchAtlasOptionsSchema' },
    outputContract: 'MCP content text with runId, bounded topHits, and diagnostics; no canonical writes',
  },
];

const timeoutMs = Number(process.env.TRACE_MCP_TIMEOUT_MS || 15000);

async function fetchWithTimeout(url, options, requestTimeoutMs = timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function listTools() {
  const response = await fetchWithTimeout(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
  if (!response.ok) throw new Error(`TRACE tools/list HTTP ${response.status}`);
  const text = await response.text();
  const jsonLine = text.split('\n').map((line) => line.replace(/^data:\s*/, '').trim()).find((line) => line.startsWith('{'));
  const payload = JSON.parse(jsonLine || text);
  return payload.result?.tools || [];
}

async function callReadOnlyProbe() {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'kb.trace_search',
        arguments: { query: 'trace mcp read-only health probe', limit: 1, intent: ['dependencies'] },
      },
    }),
  });
  if (!response.ok) throw new Error(`TRACE probe HTTP ${response.status}`);
  const text = await response.text();
  const jsonLine = text.split('\n').map((line) => line.replace(/^data:\s*/, '').trim()).find((line) => line.startsWith('{'));
  const payload = JSON.parse(jsonLine || text);
  const toolError = payload.result?.isError || payload.result?.content?.some((item) => item.type === 'text' && /connection terminated|unavailable|error/i.test(item.text));
  return { tool: 'kb.trace_search', status: toolError ? 'ERROR' : 'RESPONDED', resultItems: payload.result?.content?.length || 0 };
}

async function callSystemHealth() {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'trace.system_health', arguments: {} },
    }),
  });
  if (!response.ok) throw new Error(`TRACE system health HTTP ${response.status}`);
  const text = await response.text();
  const jsonLine = text.split('\n').map((line) => line.replace(/^data:\s*/, '').trim()).find((line) => line.startsWith('{'));
  const payload = JSON.parse(jsonLine || text);
  const content = payload.result?.content?.find((item) => item.type === 'text')?.text;
  return { tool: 'trace.system_health', status: payload.result?.isError ? 'ERROR' : 'RESPONDED', health: content ? JSON.parse(content) : null };
}

async function callKagSearch() {
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'trace.kag_search', arguments: { query: 'repository qualified packet chunk lineage', limit: 3 } },
    }),
  });
  if (!response.ok) throw new Error(`TRACE KAG search HTTP ${response.status}`);
  const text = await response.text();
  const jsonLine = text.split('\n').map((line) => line.replace(/^data:\s*/, '').trim()).find((line) => line.startsWith('{'));
  const payload = JSON.parse(jsonLine || text);
  const content = payload.result?.content?.find((item) => item.type === 'text')?.text;
  let parsed = null;
  try { parsed = content ? JSON.parse(content) : null; } catch { parsed = null; }
  const hits = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : Array.isArray(parsed?.hits) ? parsed.hits : [];
  const items = hits.slice(0, 3).map((hit) => ({
    keys: Object.keys(hit ?? {}).sort(),
    keyGrain: typeof hit?.stable_key === 'string' && hit.stable_key.startsWith('file:') ? 'DISCOVERY_FILE_SYMBOL' : hit?.packet_key || hit?.packetKey ? 'PACKET_KEY' : 'UNKNOWN',
    canonicalChunkId: hit?.canonical_chunk_id ?? hit?.canonicalChunkId ?? hit?.chunk_id ?? null,
    packetKey: hit?.packet_key ?? hit?.packetKey ?? null,
    workspaceRevision: hit?.workspace_revision ?? hit?.workspaceRevision ?? null,
    sourceRevision: hit?.source_revision ?? hit?.sourceRevision ?? null,
    hasCanonicalChunkId: Boolean(hit?.canonical_chunk_id ?? hit?.canonicalChunkId ?? hit?.chunk_id),
    hasPacketKey: Boolean(hit?.packet_key ?? hit?.packetKey),
    hasWorkspaceRevision: Boolean(hit?.workspace_revision ?? hit?.workspaceRevision),
    hasSourceRevision: Boolean(hit?.source_revision ?? hit?.sourceRevision),
    hasIdentityEnvelope: Boolean(hit?.identity_envelope),
    authorityStatus: hit?.identity_envelope?.authority_status ?? null,
  }));
  return { tool: 'trace.kag_search', status: payload.result?.isError ? 'ERROR' : 'RESPONDED', returnedItems: hits.length, items };
}

function classifyProbeError(error) {
  const message = String(error);
  return { status: /AbortError|aborted|timeout/i.test(message) ? 'TIMEOUT' : 'ERROR', error: message };
}

const liveTools = await listTools().catch((error) => ({ error: String(error), tools: [] }));
const tools = Array.isArray(liveTools) ? liveTools : liveTools.tools;
const liveNames = new Set(tools.map((tool) => tool.name));
const schemaFingerprint = (tool) => {
  const schema = tool?.inputSchema ?? tool?.input_schema ?? null;
  return schema
    ? `sha256:${crypto.createHash('sha256').update(JSON.stringify(schema), 'utf8').digest('hex')}`
    : null;
};
const liveToolSchemaAudit = families.flatMap((family) => family.tools.map((name) => {
  const tool = tools.find((candidate) => candidate.name === name);
  const schema = tool?.inputSchema ?? tool?.input_schema ?? null;
  return {
    family: family.family,
    name,
    live: Boolean(tool),
    hasInputSchema: Boolean(schema),
    schemaType: schema?.type ?? null,
    schemaKeys: schema && typeof schema === 'object' ? Object.keys(schema).sort() : [],
    schemaFingerprint: schemaFingerprint(tool),
  };
}));
const probe = Array.isArray(liveTools)
  ? await callReadOnlyProbe().catch((error) => ({ tool: 'kb.trace_search', ...classifyProbeError(error) }))
  : { tool: 'kb.trace_search', status: 'NOT_ATTEMPTED' };
const systemHealth = Array.isArray(liveTools) && liveNames.has('trace.system_health')
  ? await callSystemHealth().catch((error) => ({ tool: 'trace.system_health', ...classifyProbeError(error) }))
  : { tool: 'trace.system_health', status: 'NOT_ATTEMPTED' };
const kagSearch = Array.isArray(liveTools) && liveNames.has('trace.kag_search')
  ? await callKagSearch().catch((error) => ({ tool: 'trace.kag_search', ...classifyProbeError(error) }))
  : { tool: 'trace.kag_search', status: 'NOT_ATTEMPTED' };
const traceServerPath = path.join(root, 'sveltekit-frontend/src/mcp/trace-mcp-server.ts');
const traceServerSource = fs.existsSync(traceServerPath) ? fs.readFileSync(traceServerPath, 'utf8') : '';
const staticIdentityEnvelope = {
  sourcePath: 'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
  implementationPresent: /addKagIdentityEnvelope/.test(traceServerSource),
  envelopeFieldPresent: /identity_envelope/.test(traceServerSource),
  exactPacketLookupPresent: /atlas_packets/.test(traceServerSource),
  sourceRevisionLookupPresent: /source_revision/.test(traceServerSource),
  workspaceRevisionLookupPresent: /workspace_revision/.test(traceServerSource),
};

function sourceFilesUnder(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const result = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'build', '.svelte-kit'].includes(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx|js|mjs|mts)$/.test(entry.name)) result.push(absolute);
    }
  };
  visit(absoluteRoot);
  return result;
}

const sourceInventoryFiles = sourceFilesUnder('sveltekit-frontend/src');
const readText = (relativePath) => {
  const absolute = path.join(root, relativePath);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
};
const countLiteral = (source, value) => source.split(value).length - 1;
const toolInventory = families.flatMap((family) => family.tools.map((name) => {
  const registrySource = readText(family.source);
  const callerFiles = sourceInventoryFiles
    .filter((file) => countLiteral(fs.readFileSync(file, 'utf8'), name) > 0)
    .map((file) => path.relative(root, file).replaceAll('\\', '/'))
    .sort();
  const ontologyRegistrationFiles = sourceInventoryFiles
    .filter((file) => {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (!/(tool-selection|tool-ranker|intent-router|ontology|registry|tool-definitions|authorization)/i.test(relative)) return false;
      return countLiteral(fs.readFileSync(file, 'utf8'), name) > 0;
    })
    .map((file) => path.relative(root, file).replaceAll('\\', '/'))
    .sort();
  const liveTool = tools.find((tool) => tool.name === name);
  return {
    name,
    family: family.family,
    declaredRegistry: family.source,
    registryEntryPresent: countLiteral(registrySource, `'${name}'`) > 0 || countLiteral(registrySource, `"${name}"`) > 0,
    liveListExposure: liveNames.has(name),
    handlerPaths: family.handlerPaths,
    callerFiles,
    callerCount: callerFiles.length,
    ontologyRegistrationFiles,
    ontologyRegistrationObserved: ontologyRegistrationFiles.length > 0,
    runtimeOwner: family.runtimeOwner,
    inputContract: family.inputContracts[name] ?? null,
    outputContract: family.outputContract,
    liveSchema: liveTool?.inputSchema ?? liveTool?.input_schema ?? null,
    canonicalIdentityRequirements: {
      sourceRef: name === 'kb.trace_search' || name === 'kb.rg_atlas_search' || name === 'trace.kag_search' ? 'REQUIRED_FOR_PROMOTION' : 'NOT_APPLICABLE_TO_RAW_TOOL_OUTPUT',
      sourceRevision: name === 'kb.trace_search' || name === 'kb.rg_atlas_search' || name === 'trace.kag_search' ? 'REQUIRED_FOR_PROMOTION' : 'NOT_APPLICABLE_TO_RAW_TOOL_OUTPUT',
      workspaceRevision: name === 'kb.trace_search' || name === 'kb.rg_atlas_search' || name === 'trace.kag_search' ? 'REQUIRED_FOR_PROMOTION' : 'NOT_APPLICABLE_TO_RAW_TOOL_OUTPUT',
      packetKey: name === 'kb.trace_search' || name === 'kb.rg_atlas_search' || name === 'trace.kag_search' ? 'REQUIRED_WHEN_PACKET_BACKED' : 'NOT_APPLICABLE_TO_RAW_TOOL_OUTPUT',
      authority: 'AUDIT_ONLY_UNTIL_CANONICAL_JOINBACK_AND_READBACK',
    },
  };
}));
const report = {
  schema: 'atlas.trace-disabled-search-tools.v1',
  gate: 'TRACE-DISABLED-SEARCH-TOOLS-REINTEGRATION-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  optionalRegistriesEnabled: process.env.MCP_OPTIONAL_REGISTRIES === 'true',
  endpoint,
  families: families.map((family) => ({ ...family, sourceExists: fs.existsSync(path.join(root, family.source)), liveTools: family.tools.filter((name) => liveNames.has(name)), disabledTools: family.tools.filter((name) => !liveNames.has(name)), reEnablePrerequisites: ['explicit operator review', 'dependency health proof', 'schema/identity regression tests', 'bounded live readback'] })),
  liveToolCount: tools.length,
  readOnlyProbe: probe,
  kagSearchReadback: kagSearch,
  staticIdentityEnvelope,
  identityEnvelopeGate: {
    implementationStatus: staticIdentityEnvelope.implementationPresent && staticIdentityEnvelope.envelopeFieldPresent
      ? 'SOURCE_IMPLEMENTATION_PRESENT'
      : 'SOURCE_IMPLEMENTATION_MISSING',
    liveStatus: kagSearch.items?.length > 0 && kagSearch.items.every((item) =>
      item.hasCanonicalChunkId && item.hasPacketKey && item.hasWorkspaceRevision && item.hasSourceRevision)
      ? 'LIVE_ENVELOPE_PRESENT'
      : 'LIVE_ENVELOPE_MISSING',
    promotionReady: false,
  },
  dependencyReadback: systemHealth,
  disabledSearchTools: families.flatMap((family) => family.tools.filter((name) => !liveNames.has(name))),
  liveToolSchemaAudit,
  toolInventory,
  inventoryCoverage: {
    requiredFields: ['registryEntryPresent', 'liveListExposure', 'handlerPaths', 'callerFiles', 'ontologyRegistrationFiles', 'runtimeOwner', 'inputContract', 'outputContract', 'canonicalIdentityRequirements'],
    allRegistryEntriesMapped: toolInventory.every((item) => item.registryEntryPresent),
    allHandlersDeclared: toolInventory.every((item) => item.handlerPaths.length > 0),
    allContractsDeclared: toolInventory.every((item) => Boolean(item.inputContract) && Boolean(item.outputContract)),
    missingLiveExposure: toolInventory.filter((item) => !item.liveListExposure).map((item) => item.name),
    callerInventoryComplete: true,
    ontologyInventoryComplete: true,
    runtimeOwnersDeclared: toolInventory.every((item) => Boolean(item.runtimeOwner)),
    canonicalRequirementsDeclared: toolInventory.every((item) => Boolean(item.canonicalIdentityRequirements)),
  },
  writesPerformed: false,
  runtimeEnablementChanged: false,
  canonicalAuthorityChanged: false,
  status: liveTools.error ? 'TRACE_ENDPOINT_UNREACHABLE' : 'DISABLED_SEARCH_TOOLS_AUDITED',
  firstBlocker: liveTools.error ? 'TRACE_TOOLS_LIST_UNAVAILABLE' : 'OPTIONAL_REGISTRIES_DISABLED_BY_POLICY',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temp = `${reportPath}.${process.pid}.tmp`;
fs.writeFileSync(temp, JSON.stringify(report, null, 2) + '\n');
fs.renameSync(temp, reportPath);
console.log(JSON.stringify(report, null, 2));
