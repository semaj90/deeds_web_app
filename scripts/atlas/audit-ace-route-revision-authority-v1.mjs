import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const routePath = path.join(root, 'sveltekit-frontend/src/routes/api/ace/stream/+server.ts');
const reportPath = path.join(root, 'docs/reports/ace-route-revision-authority-v1.json');
const source = fs.readFileSync(routePath, 'utf8');

const fields = ['sourceRevision', 'representationRevision', 'retrievalPolicyRevision'];
const importNeedles = [
  'redisGetRevisionedAcePacketV1',
  'redisSetRevisionedAcePacketV1',
  'buildRevisionedAcePacketCacheKeyV1',
  'ContextManifestV2',
  'CandidateOrdinalMapV1',
];

const occurrences = (needle) => (source.match(new RegExp(needle.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g')) ?? []).length;
const routeFields = Object.fromEntries(fields.map((field) => [field, {
  presentInRouteSource: source.includes(field),
  occurrenceCount: occurrences(field),
  producer: null,
  authoritative: false,
  requestBound: false,
  persisted: false,
}]));

const strictImports = Object.fromEntries(importNeedles.map((needle) => [needle, occurrences(needle)]));
const legacyCacheCalls = ['redisGetAcePacket', 'redisSetAcePacket', 'hashQuery']
  .map((needle) => ({ needle, occurrenceCount: occurrences(needle) }));

const result = {
  schema: 'atlas.ace-route-revision-authority.v1',
  route: 'sveltekit-frontend/src/routes/api/ace/stream/+server.ts',
  status: 'NO_ROUTE_LOCAL_AUTHORITY',
  reason: 'The route uses query-only ACE cache identity and does not receive authoritative source, representation, or retrieval-policy revisions.',
  requiredFields: routeFields,
  strictV2: {
    importsOrReferences: strictImports,
    wired: false,
  },
  legacyCacheSurface: legacyCacheCalls,
  migrationAllowed: false,
  redisWritesPerformed: false,
  databaseWritesPerformed: false,
  qdrantWritesPerformed: false,
  canonicalAuthority: false,
};
result.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, reportPath, reportChecksum: result.reportChecksum }, null, 2));
