/**
 * Contract parity registry (CONTRACT-PARITY-HARNESS-01). One entry per contract: the Zod schema, its JSON Schema exporter, and
 * hand-written fixtures. Verdicts are NOT written here — the exporter records them FROM ZOD, and the Python side must match.
 * Add a contract = add an entry here + a Pydantic model in python/atlas_contract_parity/registry.py. No other plumbing.
 */
import {
  UNKNOWN_RESOLUTION_SCHEMA_V1, unknownIdFromNaturalKeyV1, unknownResolutionV1JsonSchema, unknownResolutionV1Schema,
} from '../../../sveltekit-frontend/src/lib/server/atlas/contracts/unknown-resolution-v1.js';
import {
  RESEARCH_EVIDENCE_SCHEMA_V1, researchEvidenceV1JsonSchema, researchEvidenceV1Schema,
} from '../../../sveltekit-frontend/src/lib/server/atlas/contracts/research-evidence-v1.js';
import {
  RESEARCH_EVIDENCE_BUNDLE_SCHEMA_V1, buildResearchEvidenceBundleV1, researchEvidenceBundleChecksumV1, researchEvidenceBundleV1JsonSchema, researchEvidenceBundleV1Schema, researchEvidenceSetChecksumV1,
} from '../../../sveltekit-frontend/src/lib/server/atlas/contracts/research-evidence-bundle-v1.js';

export interface ParityFixture { id: string; value: unknown; crossField?: boolean }
export interface ParityRegistryEntry {
  schemaId: string;
  schemaVersion: string;
  contractFile: string; // repo-relative; hashed into producerRevision
  safeParse: (v: unknown) => { success: boolean };
  jsonSchema: () => Record<string, unknown>;
  fixtures: () => ParityFixture[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fx = (name: string, value: unknown, crossField = false): ParityFixture => ({ id: slug(name), value, ...(crossField ? { crossField: true } : {}) });

function unknownFixtures(): ParityFixture[] {
  const SNAP = 'sha256:' + 'a'.repeat(64);
  const good: Record<string, unknown> = {
    schema: UNKNOWN_RESOLUTION_SCHEMA_V1, unknownId: unknownIdFromNaturalKeyV1(['FEATURE_EVIDENCE_GAP', SNAP, 'packet:1', 'legacy_summary_cosine_max']),
    subjectKind: 'FEATURE_EVIDENCE_GAP', subjectId: 'packet:1', snapshotRevision: SNAP, unknownKind: 'MISSING_FEATURE_VALUE',
    featureName: 'legacy_summary_cosine_max', reasonCode: 'NO_PROVEN_CHUNK_LINEAGE', requiredEvidenceKind: 'PROVEN_PACKET_CHUNK_LINEAGE',
    resolverKind: 'SOURCE_LINEAGE_REPAIR', status: 'OPEN', evidenceRefs: ['x'], resolutionRevision: null, canonicalAuthority: false,
  };
  const without = (k: string) => { const o = { ...good }; delete o[k]; return o; };
  return [
    fx('valid feature gap', good),
    fx('valid packet identity (null snapshot, null feature)', { ...good, subjectKind: 'PACKET_IDENTITY', snapshotRevision: null, featureName: null, resolverKind: 'PACKET_PROMOTION_PIPELINE' }),
    fx('valid resolved with revision', { ...good, status: 'RESOLVED', resolutionRevision: 'rev-1' }),
    fx('extra value field', { ...good, value: 0 }),
    fx('extra rawCosine field', { ...good, rawCosine: 0.2 }),
    fx('canonicalAuthority true', { ...good, canonicalAuthority: true }),
    fx('unknown subjectKind', { ...good, subjectKind: 'GUESSED' }),
    fx('unknown resolverKind', { ...good, resolverKind: 'MAGIC' }),
    fx('unknown status', { ...good, status: 'DONE' }),
    fx('free-form reasonCode', { ...good, reasonCode: 'BECAUSE' }),
    fx('retired resolverKind DOCUMENT_CRAWL', { ...good, resolverKind: 'DOCUMENT_CRAWL' }),
    fx('valid pinned doc crawl resolver', { ...good, resolverKind: 'PINNED_DOC_CRAWL', reasonCode: 'PINNED_DOCUMENTATION_MISSING' }),
    fx('non-uuid unknownId', { ...good, unknownId: 'not-a-uuid' }),
    fx('uuid v4 not v5', { ...good, unknownId: '3f2b8c1e-5d4a-4b6f-9a1e-2c7d8e9f0a1b' }),
    fx('wrong schema literal', { ...good, schema: 'atlas.unknown-resolution.v2' }),
    fx('missing status', without('status')),
    fx('missing evidenceRefs', without('evidenceRefs')),
    fx('empty subjectId', { ...good, subjectId: '' }),
    fx('numeric subjectId', { ...good, subjectId: 7 }),
    fx('empty evidenceRef string', { ...good, evidenceRefs: [''] }),
    fx('feature gap without snapshot', { ...good, snapshotRevision: null }, true),
    fx('feature gap without featureName', { ...good, featureName: null }, true),
    fx('resolved without revision', { ...good, status: 'RESOLVED' }, true),
    fx('undefined-like null schema', { ...good, schema: null }),
  ];
}

function researchEvidenceFixtures(): ParityFixture[] {
  const D = 'sha256:' + 'a'.repeat(64);
  const REV = 'sha256:' + 'b'.repeat(64);
  const code: Record<string, unknown> = {
    schema: RESEARCH_EVIDENCE_SCHEMA_V1, evidenceId: 'ev:1', sourceKind: 'CODE', sourceRef: 'src/a.ts', sourceRevision: REV, contentDigest: D,
    proposition: 'src/a.ts exports foo', confidence: 0.9, evidenceRefs: ['ast:1'], webProvenance: null, producerRevision: 'r1', canonicalAuthority: false,
  };
  const prov = { url: 'https://example.org/page', fetchedAt: '2026-09-26T12:00:00Z', responseDigest: D };
  const web = { ...code, sourceKind: 'WEB', sourceRef: 'https://example.org/page', sourceRevision: null, webProvenance: prov };
  const without = (k: string) => { const o = { ...code }; delete o[k]; return o; };
  return [
    fx('valid code evidence', code),
    fx('valid pinned documentation', { ...code, sourceKind: 'PINNED_DOCUMENTATION', sourceRef: 'docs/.okf/pinned/postgres-18' }),
    fx('valid openwiki claim', { ...code, sourceKind: 'OPENWIKI_CLAIM', sourceRef: 'openwiki/page#claim-1' }),
    fx('valid web with provenance and null revision', web),
    fx('valid web with revision too', { ...web, sourceRevision: REV }),
    fx('valid fractional timestamp', { ...web, webProvenance: { ...prov, fetchedAt: '2026-09-26T12:00:00.123Z' } }),
    fx('valid confidence bounds zero', { ...code, confidence: 0 }),
    fx('valid confidence bounds one', { ...code, confidence: 1 }),
    fx('extra value field', { ...code, value: 1 }),
    fx('extra packet_key field', { ...code, packet_key: 'p' }),
    fx('canonicalAuthority true', { ...code, canonicalAuthority: true }),
    fx('unknown sourceKind', { ...code, sourceKind: 'RUMOR' }),
    fx('wrong schema literal', { ...code, schema: 'atlas.research-evidence.v2' }),
    fx('null schema', { ...code, schema: null }),
    fx('digest without prefix', { ...code, contentDigest: 'a'.repeat(64) }),
    fx('digest uppercase', { ...code, contentDigest: 'sha256:' + 'A'.repeat(64) }),
    fx('digest short', { ...code, contentDigest: 'sha256:' + 'a'.repeat(63) }),
    fx('confidence above one', { ...code, confidence: 1.5 }),
    fx('confidence negative', { ...code, confidence: -0.1 }),
    fx('confidence string', { ...code, confidence: '0.9' }),
    fx('confidence boolean', { ...code, confidence: true }),
    fx('empty proposition', { ...code, proposition: '' }),
    fx('empty evidenceId', { ...code, evidenceId: '' }),
    fx('empty evidenceRefs list', { ...code, evidenceRefs: [] }),
    fx('empty evidenceRef string', { ...code, evidenceRefs: [''] }),
    fx('missing producerRevision', without('producerRevision')),
    fx('missing webProvenance key', without('webProvenance')),
    fx('missing sourceRevision key', without('sourceRevision')),
    fx('empty sourceRevision string', { ...code, sourceRevision: '' }),
    fx('web bad url scheme', { ...web, webProvenance: { ...prov, url: 'ftp://example.org/x' } }),
    fx('web bad timestamp no zone', { ...web, webProvenance: { ...prov, fetchedAt: '2026-09-26T12:00:00' } }),
    fx('web bad response digest', { ...web, webProvenance: { ...prov, responseDigest: 'nope' } }),
    fx('web provenance extra field', { ...web, webProvenance: { ...prov, status: 200 } }),
    fx('code without revision', { ...code, sourceRevision: null }, true),
    fx('pinned documentation without revision', { ...code, sourceKind: 'PINNED_DOCUMENTATION', sourceRevision: null }, true),
    fx('openwiki claim without revision', { ...code, sourceKind: 'OPENWIKI_CLAIM', sourceRevision: null }, true),
    fx('web without provenance', { ...web, webProvenance: null }, true),
    fx('code with web provenance', { ...code, webProvenance: prov }, true),
  ];
}

function bundleFixtures(): ParityFixture[] {
  const D = 'sha256:' + 'a'.repeat(64);
  const REV = 'sha256:' + 'b'.repeat(64);
  const WS = 'sha256:' + 'c'.repeat(64);
  const ev = (id: string, over: Record<string, unknown> = {}): any => ({
    schema: 'atlas.research-evidence.v1', evidenceId: id, sourceKind: 'CODE', sourceRef: 'src/a.ts', sourceRevision: REV, contentDigest: D,
    proposition: `proposition ${id}`, confidence: 0.5, evidenceRefs: ['ast:1'], webProvenance: null, producerRevision: 'r1', canonicalAuthority: false, ...over,
  });
  const web = ev('w1', { sourceKind: 'WEB', sourceRef: 'https://example.org/p', sourceRevision: null, webProvenance: { url: 'https://example.org/p', fetchedAt: '2026-09-26T12:00:00Z', responseDigest: D } });
  const seal = (evidence: unknown[], over: Record<string, unknown> = {}): any => {
    const body: any = { schema: RESEARCH_EVIDENCE_BUNDLE_SCHEMA_V1, requestId: 'req-1', workspaceRevision: WS, evidence, producerRevision: 'r1', evidenceSetChecksum: researchEvidenceSetChecksumV1(evidence as any), writesPerformed: false, canonicalAuthority: false, ...over };
    return { ...body, bundleChecksum: researchEvidenceBundleChecksumV1(body) };
  };
  const good = buildResearchEvidenceBundleV1({ requestId: 'req-1', workspaceRevision: WS, evidence: [ev('a'), ev('b')] as any, producerRevision: 'r1' });
  const otherRequest = buildResearchEvidenceBundleV1({ requestId: 'req-2', workspaceRevision: WS, evidence: [ev('a'), ev('b')] as any, producerRevision: 'r1' });
  const tamper = (o: Record<string, unknown>) => ({ ...good, ...o });
  const without = (k: string) => { const o: any = { ...good }; delete o[k]; return o; };
  return [
    fx('valid two code evidence', good),
    fx('valid reordered evidence keeps checksum', { ...good, evidence: [...good.evidence].reverse() }),
    fx('valid different request keeps evidence set checksum', otherRequest),
    fx('valid code plus web', seal([ev('a'), web])),
    fx('valid single evidence', seal([ev('only')])),
    fx('valid integral and fractional confidence', seal([ev('c1', { confidence: 1 }), ev('c2', { confidence: 0.25 }), ev('c3', { confidence: 0 })])),
    // UTF-8 byte order (not UTF-16 code-unit order) decides evidence order in the checksum: U+1F600 sorts after U+FF5E by bytes but before it by code units.
    fx('valid non-ascii evidence id order', seal([ev('éclair'), ev('zeta'), ev('\u{1F600}'), ev('～')])),
    fx('extra bundle field', tamper({ extra: 1 })),
    fx('writesPerformed true', tamper({ writesPerformed: true })),
    fx('canonicalAuthority true', tamper({ canonicalAuthority: true })),
    fx('wrong schema literal', tamper({ schema: 'atlas.research-evidence-bundle.v2' })),
    fx('missing requestId', without('requestId')),
    fx('empty requestId', tamper({ requestId: '' })),
    fx('malformed workspaceRevision', tamper({ workspaceRevision: 'rev-1' })),
    fx('empty evidence list', seal([])),
    fx('checksum without prefix', tamper({ bundleChecksum: good.bundleChecksum.slice('sha256:'.length) })),
    fx('extra field on evidence item', seal([{ ...ev('a'), value: 1 }])),
    fx('missing evidenceSetChecksum', without('evidenceSetChecksum')),
    fx('evidenceSetChecksum wrong but bundle resealed', seal([ev('a'), ev('b')], { evidenceSetChecksum: 'sha256:' + 'e'.repeat(64) }), true),
    fx('evidenceSetChecksum copied from another set', tamper({ evidenceSetChecksum: seal([ev('a')]).evidenceSetChecksum }), true),
    fx('duplicate evidence ids', seal([ev('a'), ev('a', { proposition: 'other' })]), true),
    fx('checksum mismatch flipped char', tamper({ bundleChecksum: 'sha256:' + (good.bundleChecksum.endsWith('0') ? '1' : '0').repeat(64) }), true),
    fx('tampered evidence with stale checksum', tamper({ evidence: [ev('a', { proposition: 'changed' }), ev('b')] }), true),
    fx('tampered requestId with stale checksum', tamper({ requestId: 'req-2' }), true),
    fx('nested code without revision (resealed)', seal([ev('a', { sourceRevision: null })]), true),
    fx('nested web without provenance (resealed)', seal([{ ...web, webProvenance: null }]), true),
  ];
}

export const CONTRACT_PARITY_REGISTRY: Readonly<Record<string, ParityRegistryEntry>> = {
  [UNKNOWN_RESOLUTION_SCHEMA_V1]: {
    schemaId: UNKNOWN_RESOLUTION_SCHEMA_V1, schemaVersion: '1', contractFile: 'sveltekit-frontend/src/lib/server/atlas/contracts/unknown-resolution-v1.ts',
    safeParse: (v) => unknownResolutionV1Schema.safeParse(v), jsonSchema: unknownResolutionV1JsonSchema, fixtures: unknownFixtures,
  },
  [RESEARCH_EVIDENCE_SCHEMA_V1]: {
    schemaId: RESEARCH_EVIDENCE_SCHEMA_V1, schemaVersion: '1', contractFile: 'sveltekit-frontend/src/lib/server/atlas/contracts/research-evidence-v1.ts',
    safeParse: (v) => researchEvidenceV1Schema.safeParse(v), jsonSchema: researchEvidenceV1JsonSchema, fixtures: researchEvidenceFixtures,
  },
  [RESEARCH_EVIDENCE_BUNDLE_SCHEMA_V1]: {
    schemaId: RESEARCH_EVIDENCE_BUNDLE_SCHEMA_V1, schemaVersion: '1', contractFile: 'sveltekit-frontend/src/lib/server/atlas/contracts/research-evidence-bundle-v1.ts',
    safeParse: (v) => researchEvidenceBundleV1Schema.safeParse(v), jsonSchema: researchEvidenceBundleV1JsonSchema, fixtures: bundleFixtures,
  },
};
