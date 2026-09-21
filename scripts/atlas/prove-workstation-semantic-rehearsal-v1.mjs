#!/usr/bin/env node
/**
 * WORKSTATION-SEMANTIC-REHEARSAL-01
 *
 * A bounded, report-only rehearsal of the existing workstation identity
 * boundary. This deliberately uses a synthetic qualified fixture: it proves
 * deterministic identity and contract presence without pretending that the
 * current live packet/chunk cohort is admitted. No database, vector, cache,
 * Graphify, or source-data writes are performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = path.join(ROOT, 'docs/reports/workstation-semantic-rehearsal-v1.json');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(ROOT, relativePath));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

function deriveFixtureUuidV8(domainClass, attributes) {
  const canonicalAttributes = Object.fromEntries(Object.entries(attributes)
    .map(([key, value]) => [key.trim(), String(value).trim()])
    .filter(([key]) => key.length > 0)
    .sort(([a], [b]) => a.localeCompare(b)));
  const input = JSON.stringify({ domainClass: domainClass.trim(), attributes: canonicalAttributes });
  const bytes = crypto.createHash('sha256').update(input, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const checks = [];
const check = (id, status, detail, extra = {}) => checks.push({ id, status, detail, ...extra });

const fixture = {
  packetKey: 'packet:rehearsal:semantic-01',
  canonicalChunkId: 'chunk:rehearsal:semantic-01',
  chunkRowId: '00000000-0000-4000-8000-000000000001',
  sourceRef: 'sveltekit-frontend/src/lib/server/rehearsal.ts',
  sourceRevision: `sha256:${'1'.repeat(64)}`,
  workspaceRevision: `sha256:${'2'.repeat(64)}`,
  representationRevision: 'semantic_768:v1',
};

const identityInput = {
  packetKey: fixture.packetKey,
  canonicalChunkId: fixture.canonicalChunkId,
  sourceRevision: fixture.sourceRevision,
  workspaceRevision: fixture.workspaceRevision,
  representationRevision: fixture.representationRevision,
};
const derivedUuid = deriveFixtureUuidV8('parent-atlas-semantic-chunk', identityInput);
const exact = [{ id: fixture.chunkRowId, canonicalChunkId: fixture.canonicalChunkId, packetKey: fixture.packetKey, score: 1 }];
const hnsw = [{ ...exact[0] }];
const goPassthrough = { ...hnsw[0], sourceRevision: fixture.sourceRevision, workspaceRevision: fixture.workspaceRevision };
const studioPassthrough = { canonicalChunkId: goPassthrough.canonicalChunkId, packetKey: goPassthrough.packetKey };

try {
  const uuidOwner = read('sveltekit-frontend/src/lib/utils/uuid.ts');
  check('owner.uuid-v8', /UUID_DERIVATION_REVISION/.test(uuidOwner) && /export async function deriveUUID/.test(uuidOwner) ? 'PASS' : 'FAIL', 'existing UUIDv8 derivation owner is present');
  check('owner.chunk-lineage', exists('sveltekit-frontend/drizzle/manual/20260901_atlas_packet_chunk_lineage.sql') ? 'PASS' : 'FAIL', 'existing 1:N packet→chunk lineage schema is present');
  check('owner.pgvector', /contentEmbedding/.test(read('sveltekit-frontend/src/lib/server/db/schema-postgres.ts')) ? 'PASS' : 'FAIL', 'existing Drizzle read model exposes the pgvector chunk owner');
  check('owner.go-retrieval', exists('sveltekit-frontend/src/lib/server/retrieval/go-retrieval-facade.ts') ? 'PASS' : 'FAIL', 'existing Go Retrieval facade is present');
  check('owner.studio', exists('sveltekit-frontend/src/routes/(app)/admin/unified-indexing-studio/+page.server.ts') && exists('sveltekit-frontend/src/routes/api/atlas/studio/search/+server.ts') ? 'PASS' : 'FAIL', 'existing Studio SSR/API owners are present');

  check('fixture.revision-qualified', Object.values(identityInput).every((value) => String(value).length > 0) ? 'PASS' : 'FAIL', 'fixture carries packet/chunk and all revision identities', { identityInput });
  check('fixture.uuid-v8-deterministic', deriveFixtureUuidV8('parent-atlas-semantic-chunk', identityInput) === derivedUuid && derivedUuid[14] === '8' && /[89ab]/.test(derivedUuid[19]) ? 'PASS' : 'FAIL', 'same qualified identity derives the same RFC-variant UUIDv8', { derivedUuid });
  check('fixture.exact-hnsw-identity', stable(exact.map(({ id, canonicalChunkId, packetKey }) => ({ id, canonicalChunkId, packetKey }))) === stable(hnsw.map(({ id, canonicalChunkId, packetKey }) => ({ id, canonicalChunkId, packetKey }))) ? 'PASS' : 'FAIL', 'exact and HNSW result identities agree; scores are not treated as identity');
  check('fixture.go-identity-passthrough', goPassthrough.canonicalChunkId === fixture.canonicalChunkId && goPassthrough.packetKey === fixture.packetKey && goPassthrough.sourceRevision === fixture.sourceRevision ? 'PASS' : 'FAIL', 'synthetic Go Retrieval passthrough retains canonical chunk and revisions', { goPassthrough });
  check('fixture.studio-identity-passthrough', studioPassthrough.canonicalChunkId === fixture.canonicalChunkId && studioPassthrough.packetKey === fixture.packetKey ? 'PASS' : 'FAIL', 'synthetic Studio/API passthrough retains packet/chunk identity', { studioPassthrough });
  check('promotion.closed', 'PASS', 'canonical promotion remains closed for the rehearsal');
} catch (error) {
  check('rehearsal.execution', 'FAIL', error instanceof Error ? error.message : String(error));
}

const counts = checks.reduce((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
const report = {
  schema: 'atlas.workstation-semantic-rehearsal.v1',
  generatedAt: new Date().toISOString(),
  fixture,
  derivedUuid,
  counts,
  checks,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
  qdrantWrites: 0,
  valkeyWrites: 0,
  databaseWrites: 0,
  note: 'Synthetic contract rehearsal only. It does not prove current live packet→chunk admission, live Go Retrieval search identity, or SSR HTTP rendering.',
  inputChecksum: sha256(stable({ fixture, identityInput, exact, hnsw, goPassthrough, studioPassthrough })),
};
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
for (const item of checks) console.log(`${item.status.padEnd(5)} ${item.id}: ${item.detail}`);
console.log(JSON.stringify({ report: path.relative(ROOT, REPORT), counts, inputChecksum: report.inputChecksum }));
process.exit(counts.FAIL ? 1 : 0);
