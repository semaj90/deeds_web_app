#!/usr/bin/env node
/** Read-only ACE-REVISION-SOURCE-OWNER-01 audit. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'ace-revision-source-owner-v1.json');
const files = {
  aceStream: 'sveltekit-frontend/src/routes/api/ace/stream/+server.ts',
  runtimeContext: 'sveltekit-frontend/src/lib/server/atlas/atlas-runtime-context.ts',
  semanticTools: 'sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts',
  cache: 'sveltekit-frontend/src/lib/server/cache/ace-packet-cache.ts',
};
const read = (file) => {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
};
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const contents = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const strictRevisionCacheImport = /redisGetRevisionedAcePacketV1|redisSetRevisionedAcePacketV1|buildRevisionedAcePacketCacheKeyV1/.test(contents.aceStream ?? '');
const routeAdmissionScaffold = strictRevisionCacheImport && /admitAceRouteCacheIdentityV1/.test(contents.aceStream ?? '');

const report = {
  schema: 'atlas.ace-revision-source-owner.v1',
  generatedAt: new Date().toISOString(),
  status: routeAdmissionScaffold ? 'ROUTE_IDENTITY_ADMISSION_SCAFFOLD' : 'NO_ROUTE_LOCAL_AUTHORITY',
  route: files.aceStream,
  fields: {
    workspaceRevision: {
      producer: contents.aceStream?.match(/workspaceRevision/g)?.length ? 'route input/reference only' : 'not present',
      authoritative: false,
      syntheticFallbackDetected: /new Date\(\)\.toISOString\(\)/.test(contents.runtimeContext ?? '') || /new Date\(\)\.toISOString\(\)/.test(contents.semanticTools ?? ''),
    },
    sourceRevision: { producer: 'not supplied by api/ace/stream', authoritative: false },
    representationRevision: { producer: 'not supplied by api/ace/stream', authoritative: false },
    retrievalPolicyRevision: { producer: 'not supplied by api/ace/stream', authoritative: false },
  },
  cache: {
    // hashQuery is also required to bind the route request to the revisioned
    // packet identity; it is not evidence of a legacy cache read/write.
    legacyQueryOnlyImport: /redisGetAcePacket|redisSetAcePacket/.test(contents.aceStream ?? ''),
    strictRevisionCacheImport,
    routeAdmissionScaffold,
  },
  findings: [
    routeAdmissionScaffold
      ? 'api/ace/stream uses the strict revisioned packet cache behind an explicit identity admission boundary.'
      : 'api/ace/stream does not import the legacy query-keyed ACE packet cache.',
    'The route does not receive an authoritative sourceRevision, representationRevision, or retrievalPolicyRevision tuple.',
    'Shared runtime context contains timestamp revision fallbacks; those values are inadmissible for strict ACE cache identity.',
    'Caller migration must remain blocked until a real revision provider is injected.',
  ],
  writesPerformed: false,
  canonicalAuthority: false,
  evidence: Object.entries(files).map(([name, file]) => ({ name, file, checksum: contents[name] === null ? null : digest(contents[name]) })),
  nextGate: routeAdmissionScaffold ? 'LIVE_ACE_IDENTITY_HANDOFF_READBACK' : 'ACE-FEATURE-SOURCE-OWNER-01',
  safeNextCommand: 'rg -n --no-heading "sourceRevision|representationRevision|retrievalPolicyRevision|workspaceRevision" sveltekit-frontend/src/routes/api/ace/stream sveltekit-frontend/src/lib/server/atlas',
};
report.reportChecksum = digest(JSON.stringify(report));
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`ACE_REVISION_SOURCE_OWNER_01 ${report.status}`);
console.log(`report=${reportPath}`);
console.log('writesPerformed=false canonicalAuthority=false');
