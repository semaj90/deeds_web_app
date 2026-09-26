/**
 * GAN-ADVERSARIAL-PROOF-01 — probe suite. Deterministic fixtures only: they test whether the GATES reject bad states.
 * Whether real rows currently satisfy the gates is a different question, answered by prove-gan-audit-readonly-v1.mts.
 *
 * Every probe has:
 *   malicious()  returns the rejection code the owner produced, or null if the owner ACCEPTED it (= the probe FAILED).
 *   control()    a benign input through the same owner; must be accepted (null). A gate that rejects everything proves nothing.
 * A probe passes only if malicious() returns exactly `expectedCode` AND control() (when present) returns null.
 *
 * ADV001-ADV006 keep their historical meanings and are executed against the real atlas-core validators (not re-implemented here).
 * ADV007-ADV016 are new and run against the main-repo owners: identity resolver, ordinal-map integrity, lineage qualifier,
 * eligibility, BitFrost cache identity, ContextManifest admission.
 */
import { validateBlockedTermsV2, validateOperationOrderV2, validateSqlAgainstAllowlistV2 } from '../../../packages/atlas-core/src/validation/packet-adversarial-validator-v2.js';
import { GanAuditOrchestrator } from '../../../packages/atlas-core/src/validation/gan-audit-integration.js';
import { resolveCanonicalIdentityV2 } from '../../../sveltekit-frontend/src/lib/server/retrieval/identity-resolution.js';
import { assertCandidateOrdinalMapIntegrityV1, assertExecutorIdIsNotCanonicalIdentity, candidateOrdinalMapChecksum } from '../../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { qualifyEvidenceV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/identity/lineage-qualification-v1.js';
import { satisfiesEvidenceEligibilityV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/identity/atlas-coordinate-v1.js';
import { buildAceBitfrostCacheKeyV1, type AceBitfrostCacheIdentityV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.js';
import { admitCurrentAceContextManifestV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/context/ace-context-manifest-admission-v1.js';

export type ProbeLane = 'authority' | 'structuralLineage' | 'semanticProjection' | 'runtimeSideEffects';
export interface ProbeV1 {
  id: string;
  lane: ProbeLane;
  origin: 'HISTORICAL' | 'MODERN';
  description: string;
  expectedCode: string;
  malicious: () => Promise<string | null> | string | null;
  control: (() => Promise<string | null> | string | null) | null;
}

/** Static detector for implicit "latest artifact" selection (ADV008). Heuristic by design; the repo-wide sweep is IDENTITY-POLICY-REPO-01. */
export function detectImplicitLatestSelectionV1(source: string): string | null {
  const patterns: RegExp[] = [
    /\.sort\([^)]*\)\s*\.(?:pop|at)\(\s*(?:-1)?\s*\)/,
    /\.sort\([^)]*\)\s*\.reverse\(\)\s*\[\s*0\s*\]/,
    /\.at\(\s*-1\s*\)/,
    /(?:readdirSync|glob(?:Sync)?)\([^)]*\)[\s\S]{0,200}\.pop\(\)/,
    /\b(?:findLatest|getLatest|latestReceipt|latestArtifact)\w*\s*\(/,
  ];
  return patterns.some((p) => p.test(source)) ? 'IMPLICIT_LATEST_ARTIFACT_SELECTION' : null;
}

const orchestrator = () => new GanAuditOrchestrator({ operation: 'gan-audit', dryRun: true, verbose: false, batchSize: 1 } as never);

const validPacket = { packet_key: 'packet:abc', source_ref: 'src/lib/server/auth.ts', feature_id: 'auth.sessions', summary: 's', title: 't', embedding: [0.1], ganValidated: true };
async function liveValidate(packet: Record<string, unknown>): Promise<string | null> {
  const r = await orchestrator().validatePacketStructure([packet]);
  return r.hardFailures[0]?.code ?? null;
}

const identityProbe = (over: Record<string, unknown>) => resolveCanonicalIdentityV2({ laneId: 'lane:1', ...over } as never);

const expectedCoordinate = { workspaceRevision: 'ws-1', sourceRevision: 'src-1' };
const goodPacket = { packetKey: 'packet:1', workspaceRevisionKey: 'ws-1', sourceRevision: 'src-1', sourceRef: 'src/a.ts' };
const goodMember = { packetKey: 'packet:1', canonicalChunkId: 'chunk:1', revisionStatus: 'PROVEN', sourceRevision: 'src-1', lineageBindingChecksum: 'lb' };

function ordinalMap(over: Record<string, unknown> = {}) {
  const candidates = [{ candidateOrdinal: 0, workspaceRevision: 'w', candidateSnapshotRevision: 's' }];
  const base = { candidateSnapshotRevision: 's', workspaceRevision: 'w', rowCount: 1, candidates, ordinalMapChecksum: candidateOrdinalMapChecksum({ candidateSnapshotRevision: 's', workspaceRevision: 'w', candidates }) };
  return { ...base, ...over } as never;
}
const ordinalCode = (map: never): string | null => {
  try { assertCandidateOrdinalMapIntegrityV1(map); return null; } catch (e) { return String((e as Error).message).split(':')[0] ?? 'ERROR'; }
};

const cacheIdentity = (over: Partial<AceBitfrostCacheIdentityV1> = {}): AceBitfrostCacheIdentityV1 => ({
  cacheKind: 'ACE_CONTEXT', artifactKind: 'context', representationId: 'semantic_768', representationRevision: 'rep-1', candidateSnapshotRevision: 'snap-A',
  ordinalMapChecksum: 'map-X', graphRevision: 'g-1', featureRevision: 'f-1', producerRevision: 'p-1', normalizationPolicyRevision: 'n-1', artifactChecksum: 'sha256:art', ...over,
});

export const PROBES_V1: ProbeV1[] = [
  // ---- historical ids, each bound to its REAL owner and compared by exact error code (actualErrorCode === expectedErrorCode)
  { id: 'ADV001', lane: 'authority', origin: 'HISTORICAL', description: 'Missing packet_key is rejected by the packet validator', expectedCode: 'ERR_MISSING_PACKET_KEY',
    malicious: () => liveValidate({ ...validPacket, packet_key: '' }), control: () => liveValidate(validPacket) },
  { id: 'ADV002', lane: 'authority', origin: 'HISTORICAL', description: 'Structurally invalid source_ref is rejected by SourceRefValidationV1 via the packet validator', expectedCode: 'ERR_INVALID_SOURCE_REF',
    malicious: () => liveValidate({ ...validPacket, source_ref: 'NOT_A_FILE_PATH' }), control: () => liveValidate(validPacket) },
  { id: 'ADV003', lane: 'semanticProjection', origin: 'HISTORICAL', description: 'SQL against a table missing from the allowlist is rejected by the SQL allowlist validator', expectedCode: 'ERR_UNKNOWN_TABLE',
    malicious: () => { const r = validateSqlAgainstAllowlistV2('INSERT INTO totally_missing_table (id) VALUES ($1)', ['users', 'cases', 'atlas_packets']); return r.ok ? null : r.code; },
    control: () => { const r = validateSqlAgainstAllowlistV2('SELECT id FROM users', ['users', 'cases', 'atlas_packets']); return r.ok ? null : r.code; } },
  { id: 'ADV004', lane: 'semanticProjection', origin: 'HISTORICAL', description: 'Placeholder / fake terms are rejected by the blocked-term validator', expectedCode: 'ERR_BLOCKED_TERM',
    malicious: () => { const r = validateBlockedTermsV2('INSERT INTO users (id, name) VALUES ($1, fake_email_placeholder)'); return r.ok ? null : r.code; },
    control: () => { const r = validateBlockedTermsV2('SELECT id FROM users WHERE id = $1'); return r.ok ? null : r.code; } },
  { id: 'ADV005', lane: 'runtimeSideEffects', origin: 'HISTORICAL', description: 'Redis before Postgres is rejected by the operation-order validator', expectedCode: 'ERR_WRITE_ORDER_VIOLATION',
    malicious: () => { const r = validateOperationOrderV2(['redis.set', 'postgres.write']); return r.ok ? null : r.code; },
    control: () => { const r = validateOperationOrderV2(['postgres.write', 'redis.set']); return r.ok ? null : r.code; } },
  { id: 'ADV006', lane: 'runtimeSideEffects', origin: 'HISTORICAL', description: 'NATS before Postgres is rejected by the operation-order validator', expectedCode: 'ERR_EVENT_ORDER_VIOLATION',
    malicious: () => { const r = validateOperationOrderV2(['nats.publish', 'postgres.write']); return r.ok ? null : r.code; },
    control: () => { const r = validateOperationOrderV2(['postgres.write', 'nats.publish']); return r.ok ? null : r.code; } },

  // ---- modern
  { id: 'ADV007', lane: 'authority', origin: 'MODERN', description: 'A packet_id (storage locator) offered alone never resolves to canonical identity',
    expectedCode: 'IDENTITY_NOT_CANONICAL:DEGRADED',
    malicious: () => { const r = identityProbe({ laneId: 'packet_id:0123456789abcdef' }); return r.resolutionStatus === 'CANONICAL' ? null : `IDENTITY_NOT_CANONICAL:${r.resolutionStatus}`; },
    control: () => { const r = identityProbe({ packetKey: 'packet:abc' }); return r.resolutionStatus === 'CANONICAL' ? null : 'UNEXPECTED_REJECT'; } },
  { id: 'ADV008', lane: 'authority', origin: 'MODERN', description: 'Selecting an authoritative artifact by latest timestamp / glob-sort is detected',
    expectedCode: 'IMPLICIT_LATEST_ARTIFACT_SELECTION',
    malicious: () => detectImplicitLatestSelectionV1("const f = fs.readdirSync(dir).filter((n) => n.startsWith('receipt-')).sort().pop();"),
    control: () => detectImplicitLatestSelectionV1("const f = `receipt-${pinnedCoordinate.candidateSnapshotRevision}.json`;") },
  { id: 'ADV009', lane: 'authority', origin: 'MODERN', description: 'CandidateOrdinalMap checksum mismatch is rejected', expectedCode: 'CANDIDATE_ORDINAL_MAP_CHECKSUM_MISMATCH',
    malicious: () => ordinalCode(ordinalMap({ ordinalMapChecksum: 'f'.repeat(64) })), control: () => ordinalCode(ordinalMap()) },
  { id: 'ADV010', lane: 'structuralLineage', origin: 'MODERN', description: 'Packet-qualified evidence is refused by a CHUNK-grain feature', expectedCode: 'CHUNK_ELIGIBILITY_UNSATISFIED',
    malicious: () => { const v = qualifyEvidenceV1({ packet: goodPacket, memberships: [], expected: expectedCoordinate }); return satisfiesEvidenceEligibilityV1(v.eligibility, 'CHUNK_REVISION_QUALIFIED') ? null : 'CHUNK_ELIGIBILITY_UNSATISFIED'; },
    control: () => { const v = qualifyEvidenceV1({ packet: goodPacket, memberships: [goodMember], expected: expectedCoordinate }); return satisfiesEvidenceEligibilityV1(v.eligibility, 'CHUNK_REVISION_QUALIFIED') ? null : 'UNEXPECTED_REJECT'; } },
  { id: 'ADV011', lane: 'structuralLineage', origin: 'MODERN', description: 'source_revision mismatch never yields chunk qualification', expectedCode: 'SOURCE_REVISION_MISMATCH',
    malicious: () => { const v = qualifyEvidenceV1({ packet: goodPacket, memberships: [{ ...goodMember, sourceRevision: 'src-0' }], expected: expectedCoordinate }); return v.derivable.chunkDerived ? null : v.chunkIdentity.status; },
    control: () => { const v = qualifyEvidenceV1({ packet: goodPacket, memberships: [goodMember], expected: expectedCoordinate }); return v.derivable.chunkDerived ? null : 'UNEXPECTED_REJECT'; } },
  { id: 'ADV012', lane: 'structuralLineage', origin: 'MODERN', description: 'workspace_revision mismatch never yields chunk qualification', expectedCode: 'WORKSPACE_REVISION_MISMATCH',
    malicious: () => { const v = qualifyEvidenceV1({ packet: { ...goodPacket, workspaceRevisionKey: 'ws-0' }, memberships: [goodMember], expected: expectedCoordinate }); return v.derivable.chunkDerived ? null : v.chunkIdentity.status; },
    control: () => { const v = qualifyEvidenceV1({ packet: goodPacket, memberships: [goodMember], expected: expectedCoordinate }); return v.derivable.chunkDerived ? null : 'UNEXPECTED_REJECT'; } },
  { id: 'ADV013', lane: 'authority', origin: 'MODERN', description: 'A Qdrant point id equal to the canonical id is not accepted as identity', expectedCode: 'EXECUTOR_IDENTITY_SUBSTITUTION_REJECTED',
    malicious: () => { try { assertExecutorIdIsNotCanonicalIdentity({ canonicalId: '12345', qdrantPointId: 12345 }); return null; } catch (e) { return String((e as Error).message).split(':')[0] ?? 'ERROR'; } },
    control: () => { try { assertExecutorIdIsNotCanonicalIdentity({ canonicalId: 'packet:abc', qdrantPointId: 12345 }); return null; } catch (e) { return String((e as Error).message); } } },
  { id: 'ADV014', lane: 'authority', origin: 'MODERN', description: 'An unqualified content_hash is not promoted to exact identity', expectedCode: 'HASH_EVIDENCE_UNQUALIFIED',
    malicious: () => { const r = identityProbe({ contentHash: 'sha256:' + 'a'.repeat(64) }); return r.resolutionStatus === 'PROJECTION_EXACT' ? null : 'HASH_EVIDENCE_UNQUALIFIED'; },
    control: () => { const r = identityProbe({ contentHash: 'sha256:' + 'a'.repeat(64), hashContract: { hashAlgorithm: 'sha256', hashDomain: 'chunk-content-v1', producerRevision: 'p1' } }); return r.resolutionStatus === 'PROJECTION_EXACT' ? null : 'UNEXPECTED_REJECT'; } },
  { id: 'ADV015', lane: 'runtimeSideEffects', origin: 'MODERN', description: 'A BitFrost entry cannot be reused across a coordinate mismatch', expectedCode: 'CACHE_KEY_COORDINATE_MISMATCH',
    malicious: () => buildAceBitfrostCacheKeyV1(cacheIdentity()) === buildAceBitfrostCacheKeyV1(cacheIdentity({ candidateSnapshotRevision: 'snap-B' })) ? null : 'CACHE_KEY_COORDINATE_MISMATCH',
    control: () => buildAceBitfrostCacheKeyV1(cacheIdentity()) === buildAceBitfrostCacheKeyV1(cacheIdentity()) ? null : 'UNEXPECTED_KEY_DRIFT' },
  { id: 'ADV016', lane: 'structuralLineage', origin: 'MODERN', description: 'A blocked candidate-feature admission cannot produce a ContextManifest', expectedCode: 'BLOCKED_FEATURE_SNAPSHOT',
    malicious: () => {
      const r = admitCurrentAceContextManifestV1({ featureAdmission: { status: 'BLOCKED_REVISION_MISMATCH', snapshot: null } as never, requestId: 'r', tokenBudget: 1000, retrievalPolicyRevision: 'p', acePlaybookRevision: 'a', representationRevision: 'rep', graphRevision: 'g' });
      return r.status === 'ADMITTED' ? null : r.status;
    },
    control: null /* an ADMITTED control needs a full candidate-feature snapshot; covered by ace-context-manifest-admission-v1.spec.ts */ },
];

/**
 * Re-measures the defects found in the LEGACY validators against the CURRENT owners. Expected result: no gaps. Anything returned here is a regression
 * and blocks the proof. (Legacy findings, kept as history: the old source_ref rule falsely rejected .svelte/.mts/.py, bracket routes and capitals and
 * accepted a path-traversal string; ADV003 only matched /fake_|unknown_|temp_/, so a genuinely nonexistent table was accepted.)
 */
export async function measureHistoricalKnownGapsV1(): Promise<Array<{ id: string; kind: 'FALSE_REJECTION' | 'FALSE_ACCEPTANCE'; detail: string; observed: string | null }>> {
  const gaps: Array<{ id: string; kind: 'FALSE_REJECTION' | 'FALSE_ACCEPTANCE'; detail: string; observed: string | null }> = [];
  for (const ref of ['src/lib/Foo.svelte', 'scripts/atlas/build-x.mts', 'python/atlas_x.py', 'src/routes/(app)/[id]/+page.svelte', 'src/lib/UpperCase.ts', 'docs/GUIDE.md', 'proto:ChatAssistantService.Health']) {
    const observed = await liveValidate({ ...validPacket, source_ref: ref });
    if (observed) gaps.push({ id: 'KG-SOURCE-REF-FALSE-REJECTION', kind: 'FALSE_REJECTION', detail: `legitimate source_ref rejected: ${ref}`, observed });
  }
  for (const ref of ['src/../../../etc/passwd.ts', '../a.ts', '/etc/passwd', 'C:/Windows/x.ts']) {
    const observed = await liveValidate({ ...validPacket, source_ref: ref });
    if (!observed) gaps.push({ id: 'KG-SOURCE-REF-FALSE-ACCEPTANCE', kind: 'FALSE_ACCEPTANCE', detail: `unsafe source_ref accepted: ${ref}`, observed });
  }
  const unknownTable = validateSqlAgainstAllowlistV2('INSERT INTO totally_missing_table (id) VALUES ($1)', ['users']);
  if (unknownTable.ok) gaps.push({ id: 'KG-SQL-ALLOWLIST', kind: 'FALSE_ACCEPTANCE', detail: 'a table missing from the allowlist was accepted', observed: null });
  return gaps;
}
