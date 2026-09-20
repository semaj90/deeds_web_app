#!/usr/bin/env node
/** Read-only census of the current RouterObservation.availableTools owner. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const routePath = path.join(root, 'sveltekit-frontend', 'src', 'routes', 'api', 'agent', 'route', '+server.ts');
const typesPath = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'router', 'router-types.ts');
const reportPath = path.join(root, 'docs', 'reports', 'router-observation-tool-owner-v1.json');
const route = fs.readFileSync(routePath, 'utf8');
const types = fs.readFileSync(typesPath, 'utf8');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const lineOf = (text, needle) => {
  const index = text.indexOf(needle);
  return index < 0 ? null : text.slice(0, index).split(/\r?\n/).length;
};
const count = (pattern) => [...route.matchAll(pattern)].length;

const body = {
  schema: 'atlas.router-observation-tool-owner-audit.v1',
  status: 'LOCAL_PHASE1_REGISTRY_OWNER_PROVEN',
  generatedAt: new Date().toISOString(),
  owner: {
    kind: 'STATIC_ROUTE_REGISTRY',
    symbol: 'MOCK_TOOL_REGISTRY',
    sourceRef: 'sveltekit-frontend/src/routes/api/agent/route/+server.ts',
    availableToolsConstruction: 'new Map(MOCK_TOOL_REGISTRY.map(([tool.name, tool]))',
    mapAssignment: 'RouterObservation.availableTools = toolMap',
    rankInput: 'rankTools(MOCK_TOOL_REGISTRY, observation)',
  },
  observations: {
    registryDeclarationLine: lineOf(route, 'const MOCK_TOOL_REGISTRY'),
    observationTypeLine: lineOf(types, 'export interface RouterObservation'),
    availableToolsAssignmentLine: lineOf(route, 'availableTools: toolMap'),
    staticToolCount: count(/name:\s*['"][^'"]+['"]/g),
    usesMcpDiscovery: /listTools|mcp.*tools|discover.*tools/i.test(route),
    usesQdrantDiscovery: /qdrant/i.test(route),
    usesNeo4jDiscovery: /neo4j/i.test(route),
    usesAgentRegistry: /register-tools|ALL_TOOLS|toolRegistry/i.test(route),
  },
  decision: {
    replaceOwnerNow: false,
    reason: 'The route is explicitly Phase 1 and uses a static registry; replacement requires a separate owner/admission decision.',
    downstreamConsumers: ['rankTools', 'selectTopTools', 'RouterObservation.availableTools'],
  },
  readOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
};
body.sourceChecksum = sha256(`${route}\n${types}`);
body.reportChecksum = sha256(JSON.stringify(body));
fs.writeFileSync(reportPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: body.status, owner: body.owner.symbol, staticToolCount: body.observations.staticToolCount, writesPerformed: false, reportPath }, null, 2));
