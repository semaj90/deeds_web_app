/**
 * Offline wiring proof: the bridge fed by the REAL resolver and REAL span
 * verifier (in-memory ordinal map + fixture source bytes), using the real
 * checksum owner. Not production Valkey data: `cacheRead` is an injected
 * observation. Run from sveltekit-frontend: npx tsx ../scripts/atlas/valkey-ace-handoff-owner-wiring-v1.test.mts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { materializeCandidateOrdinalMap } from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';
import {
  resolveCachedPacketCandidatesV1,
  verifyCachedPacketCandidateSourceSpanV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/cached-packet-candidate-resolution-v1.ts';
import { inspectValkeyAceHandoffV1 } from './valkey-ace-handoff-v1.mjs';
import { verifyReceiptChecksumV1 } from './valkey-ace-handoff-verifier-v1.mts';

const sourceText = 'export function a() {}\n';
const sourceBytes = new Uint8Array(Buffer.from(sourceText, 'utf8'));
const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;

const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision: 'snap-r1',
  workspaceRevision: 'ws-r1',
  producerRevision: 'wiring-test',
  candidates: [{
    canonicalId: 'c:a', packetKey: 'p:a', sourceRef: 'src/a.ts', treeNodeId: null, symbolVersionId: null,
    workspaceRevision: 'ws-r1', sourceRevision, graphRevision: null, semanticRevision: null,
    degradedIdentity: false, evidenceRefs: [], representationBindings: [],
  }],
});

const resolution = resolveCachedPacketCandidatesV1({
  workspaceRevision: 'ws-r1',
  ordinalMap,
  hints: [{ hintId: 'h1', kind: 'SOURCE_REF', sourceRef: 'src/a.ts' }],
});
assert.equal(resolution.matches.length, 1);
const match = resolution.matches[0]!;

const span = verifyCachedPacketCandidateSourceSpanV1(match, {
  canonicalId: match.canonicalId, packetKey: match.packetKey, sourceRef: match.sourceRef,
  sourceRevision: match.sourceRevision, workspaceRevision: match.workspaceRevision,
  evidenceRef: 'ev:1', extractorRevision: 'x:1', sourceBytes, startByte: 0, endByte: 6, text: 'export',
});

const cacheRead = () => ({
  source: 'VALKEY_GET' as const, cacheKey: 'k', cacheGeneration: 'g1', representationRevision: 'rr',
  hintId: 'h1', sourceRef: 'src/a.ts', packetKey: 'p:a', sourceRevision, workspaceRevision: 'ws-r1',
});
type Handoff = { status: string; reason?: string; observation: { candidateOrdinal: number } | null; aceInjectionAuthorized: boolean };
const run = (over: Record<string, unknown> = {}): Handoff =>
  inspectValkeyAceHandoffV1({ cacheRead: cacheRead(), resolution, sourceSpanVerification: span, verifyReceiptChecksum: verifyReceiptChecksumV1, ...over }) as Handoff;

// real receipts verify through the real checksum owner
assert.equal(verifyReceiptChecksumV1('resolution', resolution), true);
assert.equal(verifyReceiptChecksumV1('sourceSpan', span), true);
const ok = run();
assert.equal(ok.status, 'SOURCE_VERIFIED_NOT_ADMITTED');
assert.equal(ok.observation?.candidateOrdinal, 0);
assert.equal(ok.aceInjectionAuthorized, false);

// tampered receipts are caught by the real verifier
assert.equal(run({ resolution: { ...resolution, ordinalMapChecksum: 'f'.repeat(64) } }).reason, 'RESOLVER_CHECKSUM_NOT_VERIFIED');
assert.equal(run({ sourceSpanVerification: { ...span, spanChecksum: 'sha256:' + '0'.repeat(64) } }).reason, 'SOURCE_SPAN_CHECKSUM_NOT_VERIFIED');
// stale cached source revision
assert.equal(run({ cacheRead: { ...cacheRead(), sourceRevision: 'sha256:' + '1'.repeat(64) } }).reason, 'CACHE_SOURCE_REVISION_STALE');
// extra/unknown cacheRead field fails the strict schema
assert.equal(run({ cacheRead: { ...cacheRead(), extra: 1 } }).reason, 'CACHE_READ_SCHEMA_INVALID');

console.log(JSON.stringify({ schema: 'atlas.valkey-ace-handoff-owner-wiring.v1', status: 'FIXTURE_ONLY', realOwners: ['resolveCachedPacketCandidatesV1', 'verifyCachedPacketCandidateSourceSpanV1', 'canonicalSha256V1'], valkeyObserved: false }));
