#!/usr/bin/env node
/** Read-only classification of duplicate MCP tool ownership. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = {
  newTools: path.join(root, 'sveltekit-frontend', 'src', 'mcp', 'new_tools.ts'),
  traceServer: path.join(root, 'sveltekit-frontend', 'src', 'mcp', 'trace-mcp-server.ts'),
};
const read = (file) => fs.readFileSync(file, 'utf8');
const lineOf = (text, needle) => text.slice(0, text.indexOf(needle)).split(/\r?\n/).length;
const newTools = read(files.newTools);
const traceServer = read(files.traceServer);
const report = {
  schema: 'atlas.mcp-prefetch-duplicate-owner.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  toolName: 'context.prefetch_feature_context',
  registrations: [
    {
      file: 'sveltekit-frontend/src/mcp/new_tools.ts',
      line: lineOf(newTools, "'context.prefetch_feature_context'") + 1,
      registrationMode: 'registerNewTools(server, ...) imported by trace-mcp-server',
      inputShape: ['path?', 'query?', 'limit', 'activityLimit', 'includeCommunity', 'includeNotecards', 'includeAgentsMd'],
      implementation: 'buildFeaturePrefetchContext + dispatcherMiddleware',
      classification: 'CURRENT_SHARED_OWNER_CANDIDATE',
    },
    {
      file: 'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
      line: lineOf(traceServer, "'context.prefetch_feature_context'") + 1,
      registrationMode: 'inline registerTool in the same server module',
      inputShape: ['query', 'file_path?', 'top_k', 'include_kb', 'include_karpathy'],
      implementation: 'inline TRACE/KAG + KB + Karpathy bridge',
      classification: 'LEGACY_DUPLICATE_OWNER_CANDIDATE',
    },
  ],
  reachability: {
    traceServerImportsNewTools: /import\s+\{\s*registerNewTools\s*\}\s+from\s+'\.\/new_tools\.js'/.test(traceServer),
    traceServerCallsNewTools: /registerNewTools\(server/.test(traceServer),
    sameRegistryRisk: true,
    duplicateNames: 1,
  },
  decision: {
    canonicalCandidate: 'new_tools.ts',
    legacyCandidate: 'trace-mcp-server.ts inline bridge',
    action: 'CLASSIFIED_NO_CODE_CHANGE',
    rationale: [
      'Both registrations are reachable from trace-mcp-server.ts.',
      'The new_tools implementation uses the shared dispatcher and typed feature-prefetch helper.',
      'The inline TRACE bridge has a different input contract and directly fans out to legacy services.',
      'Removal or aliasing requires a separate compatibility/readback test and is not performed by this audit.',
    ],
  },
  nextGate: 'MCP_PREFETCH_OWNER_RECONCILED',
};
const reportPath = path.join(root, 'docs', 'reports', 'mcp-prefetch-duplicate-owner-v1.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/'), status: report.decision.action, canonicalCandidate: report.decision.canonicalCandidate }, null, 2));
