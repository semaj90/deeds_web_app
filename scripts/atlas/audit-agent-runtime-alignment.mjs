#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const has = (text, needle) => text.includes(needle);

const trpcPath = 'sveltekit-frontend/src/routes/api/trpc/[...procedure]/+server.ts';
const tracePath = 'sveltekit-frontend/src/mcp/trace-mcp-server.ts';
const ontologyPath = 'scripts/atlas/audit-mcp-tool-ontology.mjs';
const parityPath = 'scripts/atlas/validate-mcp-tool-registry-parity.mjs';
const rootOpenCodePath = 'opencode.jsonc';
const nestedOpenCodePath = '.opencode/opencode.jsonc';
const frontendOpenCodePath = 'sveltekit-frontend/opencode.json';

const trpc = exists(trpcPath) ? read(trpcPath) : '';
const trace = exists(tracePath) ? read(tracePath) : '';
const ontology = exists(ontologyPath) ? read(ontologyPath) : '';
const rootOpenCode = exists(rootOpenCodePath) ? read(rootOpenCodePath) : '';
const nestedOpenCode = exists(nestedOpenCodePath) ? read(nestedOpenCodePath) : '';
const frontendOpenCode = exists(frontendOpenCodePath) ? read(frontendOpenCodePath) : '';

const checks = {
  trpc: {
    routePresent: exists(trpcPath),
    fetchAdapter: has(trpc, "@trpc/server/adapters/fetch"),
    fetchRequestHandler: has(trpc, 'fetchRequestHandler'),
    requestScopedContext: has(trpc, 'createContext(event)'),
    getAndPost: has(trpc, 'export const GET = handler') && has(trpc, 'export const POST = handler'),
  },
  mastra: {
    adapterPresent: exists('sveltekit-frontend/src/lib/server/atlas/atlas-mastra-adapter.ts'),
    workflowPresent: exists('sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts'),
    apiRoutePresent: exists('sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts'),
    snapshotBridgeSpecPresent: exists('sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/mastra-snapshot-bridge.spec.ts'),
    workflowCompilerSpecPresent: exists('sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/mastra-workflow-compiler.spec.ts'),
  },
  opencode: {
    rootConfigPresent: exists(rootOpenCodePath),
    nestedConfigPresent: exists(nestedOpenCodePath),
    frontendConfigPresent: exists(frontendOpenCodePath),
    rootSelectsHforf: has(rootOpenCode, '"model": "llama-server/hforf.gguf"'),
    rootDeclaresHforf: has(rootOpenCode, '"hforf.gguf": {'),
    nestedSelectsHforf: has(nestedOpenCode, '"model": "llama-server/hforf.gguf"'),
    frontendUses8090: has(frontendOpenCode, '"baseURL": "http://127.0.0.1:8090/v1"'),
    projectToolsDirectoryPresent: exists('.opencode/tools'),
  },
  mcp: {
    traceServerPresent: exists(tracePath),
    streamableHttpTransport: has(trace, 'StreamableHTTPServerTransport'),
    monolithicSdkV1Import: has(trace, "@modelcontextprotocol/sdk/server/mcp.js"),
    registryParityAuditPresent: exists(parityPath),
    ontologyAuditPresent: exists(ontologyPath),
    ontologyHasExplicitOperationKinds:
      has(ontology, "'READ'") && has(ontology, "'AUDIT'") && has(ontology, "'PROPOSE'") && has(ontology, "'APPLY'"),
    deepAuditReportPresent: exists('docs/reports/mcp-tool-deep-audit-20260822.md'),
  },
};

const gaps = [];
if (!Object.values(checks.trpc).every(Boolean)) gaps.push('TRPC_STATIC_ALIGNMENT_INCOMPLETE');
if (!Object.values(checks.mastra).every(Boolean)) gaps.push('MASTRA_STATIC_SURFACE_INCOMPLETE');
if (!checks.opencode.rootDeclaresHforf) gaps.push('OPENCODE_ROOT_MODEL_UNDECLARED');
if (!checks.opencode.projectToolsDirectoryPresent) gaps.push('OPENCODE_PROJECT_TOOLS_DIRECTORY_MISSING');
if (checks.mcp.monolithicSdkV1Import) gaps.push('MCP_V1_STREAMABLE_HTTP_EXPLICIT');
if (!checks.mcp.ontologyHasExplicitOperationKinds) gaps.push('MCP_OPERATION_KIND_CLASSIFIER_NOT_RECONCILED');
if (!checks.mcp.deepAuditReportPresent) gaps.push('LOCAL_MCP_DEEP_AUDIT_NOT_RECONCILED_TO_GITHUB');

const report = {
  schema: 'atlas.agent-runtime-alignment-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_STATIC',
  checks,
  gaps,
  status: gaps.length === 0 ? 'STATIC_ALIGNMENT_PASS' : 'STATIC_ALIGNMENT_GAPS',
  interpretation: {
    mcpV1IsNotFailure: true,
    mcpV1RequiresExplicitCompatibilityStatus: true,
    opencodeToolsDirectoryOnlyOwnsOpenCodeLocalTools: true,
    mcpToolsMustNotBeDuplicatedIntoOpenCodeTools: true,
    mastraMustNotOwnCanonicalToolIdentity: true,
  },
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = gaps.some((gap) =>
  ['TRPC_STATIC_ALIGNMENT_INCOMPLETE', 'OPENCODE_ROOT_MODEL_UNDECLARED'].includes(gap)
) ? 2 : 0;
