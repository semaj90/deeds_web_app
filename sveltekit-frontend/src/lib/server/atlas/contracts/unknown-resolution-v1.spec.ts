// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { v5 as uuidv5 } from 'uuid';
import { ATLAS_ROOT_NAMESPACE_V1 } from '../identity/atlas-uuid-namespaces-v1.js';
import {
  UNKNOWN_REASON_CODES_V1,
  UNKNOWN_REASON_RESOLVER_TABLE_V1,
  UNKNOWN_RESOLUTION_NAMESPACE_V1,
  buildUnknownResolutionSetV1,
  mapUnknownPacketRowToUnknownResolutionV1,
  unknownIdFromNaturalKeyV1,
  unknownResolutionSetV1Schema,
  unknownResolutionV1Schema,
  verifyUnknownResolutionSetV1,
  type UnknownResolutionV1,
} from './unknown-resolution-v1.js';

const SNAP = 'sha256:' + 'a'.repeat(64);
const idFor = (packet: string) => unknownIdFromNaturalKeyV1(['FEATURE_EVIDENCE_GAP', SNAP, packet, 'legacy_summary_cosine_max']);
const gap = (over: Partial<UnknownResolutionV1> = {}): UnknownResolutionV1 => ({
  schema: 'atlas.unknown-resolution.v1',
  unknownId: idFor('packet:1'),
  subjectKind: 'FEATURE_EVIDENCE_GAP', subjectId: 'packet:1', snapshotRevision: SNAP, unknownKind: 'MISSING_FEATURE_VALUE',
  featureName: 'legacy_summary_cosine_max', reasonCode: 'NO_PROVEN_CHUNK_LINEAGE', requiredEvidenceKind: 'PROVEN_PACKET_CHUNK_LINEAGE',
  resolverKind: 'SOURCE_LINEAGE_REPAIR', status: 'OPEN', evidenceRefs: ['x'], resolutionRevision: null, canonicalAuthority: false, ...over,
});
const two = () => [gap(), gap({ subjectId: 'packet:2', unknownId: idFor('packet:2') })];
const set = (rows: UnknownResolutionV1[] = two()) =>
  buildUnknownResolutionSetV1({ subjectKind: 'FEATURE_EVIDENCE_GAP', snapshotRevision: SNAP, ordinalMapChecksum: 'b'.repeat(64), coordinateArtifactChecksum: 'sha256:' + 'e'.repeat(64), rows, inputChecksums: { featureRows: 'sha256:1' }, producerRevision: 'r1' });

describe('UnknownResolutionV1 contract', () => {
  it('parses a typed gap and never carries a value field', () => {
    expect(() => unknownResolutionV1Schema.parse(gap())).not.toThrow();
    expect(() => unknownResolutionV1Schema.parse({ ...gap(), value: 0 })).toThrow();
    expect(() => unknownResolutionV1Schema.parse({ ...gap(), rawCosine: 0.1 })).toThrow();
  });
  it('rejects canonical authority, unknown subject kinds, non-UUIDv5 ids', () => {
    expect(() => unknownResolutionV1Schema.parse({ ...gap(), canonicalAuthority: true })).toThrow();
    expect(() => unknownResolutionV1Schema.parse({ ...gap(), subjectKind: 'GUESSED' })).toThrow();
    expect(() => unknownResolutionV1Schema.parse({ ...gap(), unknownId: 'not-a-uuid' })).toThrow();
  });
  it('requires snapshot + feature name for feature gaps and a resolution revision when RESOLVED', () => {
    expect(() => unknownResolutionV1Schema.parse(gap({ snapshotRevision: null }))).toThrow('SNAPSHOT_REVISION_REQUIRED');
    expect(() => unknownResolutionV1Schema.parse(gap({ featureName: null }))).toThrow('FEATURE_NAME_REQUIRED');
    expect(() => unknownResolutionV1Schema.parse(gap({ status: 'RESOLVED' }))).toThrow('RESOLUTION_REVISION_REQUIRED');
    expect(() => unknownResolutionV1Schema.parse(gap({ status: 'RESOLVED', resolutionRevision: 'rev' }))).not.toThrow();
  });
  it('UUIDv5 ids are deterministic, namespaced, and key-sensitive', () => {
    const a = unknownIdFromNaturalKeyV1(['a', 'b']);
    expect(unknownIdFromNaturalKeyV1(['a', 'b'])).toBe(a);
    expect(unknownIdFromNaturalKeyV1(['a', 'c'])).not.toBe(a);
    expect(unknownIdFromNaturalKeyV1(['ab', ''])).not.toBe(a); // NUL-joined: no concatenation ambiguity
    expect(UNKNOWN_RESOLUTION_NAMESPACE_V1).toMatch(/^[0-9a-f-]{36}$/);
    // frozen namespace is derived from the Atlas root and the id comes from the standard uuid package
    expect(UNKNOWN_RESOLUTION_NAMESPACE_V1).toBe(uuidv5('atlas:unknown-resolution:v1', ATLAS_ROOT_NAMESPACE_V1));
    expect(unknownIdFromNaturalKeyV1(['a', 'b'])).toBe(uuidv5(['a', 'b'].join('\u0000'), UNKNOWN_RESOLUTION_NAMESPACE_V1));
  });
  it('routing table covers every enumerated reason exactly once and rejects free-form reasons', () => {
    expect(Object.keys(UNKNOWN_REASON_RESOLVER_TABLE_V1).sort()).toEqual([...UNKNOWN_REASON_CODES_V1].sort());
    expect(UNKNOWN_REASON_RESOLVER_TABLE_V1.NO_PROVEN_CHUNK_LINEAGE.resolverKind).toBe('SOURCE_LINEAGE_REPAIR');
    expect(UNKNOWN_REASON_RESOLVER_TABLE_V1.CHUNK_WITHOUT_QUALIFIED_SUMMARY.resolverKind).toBe('SUMMARY_GENERATION');
    expect(() => unknownResolutionV1Schema.parse(gap({ reasonCode: 'SOMETHING_ELSE' as never }))).toThrow();
  });
});

describe('UnknownResolutionSetV1', () => {
  it('is order independent and verifies', () => {
    const a = set(two());
    const b = set([...two()].reverse());
    expect(a.setChecksum).toBe(b.setChecksum);
    expect(() => verifyUnknownResolutionSetV1(a)).not.toThrow();
    expect(a.writesPerformed).toBe(false);
  });
  it('requires all three coordinates for a feature-gap set', () => {
    for (const k of ['snapshotRevision', 'ordinalMapChecksum', 'coordinateArtifactChecksum'] as const) {
      const t = JSON.parse(JSON.stringify(set())); t[k] = null;
      expect(() => unknownResolutionSetV1Schema.parse(t)).toThrow(`${k.toUpperCase()}_REQUIRED_FOR_FEATURE_EVIDENCE_GAP_SET`);
    }
  });
  it('rejects duplicates, mixed kinds, mixed snapshots', () => {
    expect(() => set([gap(), gap()])).toThrow('DUPLICATE_UNKNOWN_ID');
    expect(() => set([gap({ subjectKind: 'PACKET_IDENTITY', snapshotRevision: SNAP })])).toThrow('MIXED_SUBJECT_KIND');
    expect(() => set([gap({ snapshotRevision: 'sha256:' + 'c'.repeat(64) })])).toThrow('MIXED_SNAPSHOT_REVISION');
  });
  it('detects tampering: field change, count change, reorder, checksum change, authority upgrade, coordinate change', () => {
    const s = set();
    const clone = () => JSON.parse(JSON.stringify(s));
    const t1 = clone(); t1.rows[0].reasonCode = 'HUMAN_JUDGMENT_REQUIRED'; expect(() => verifyUnknownResolutionSetV1(t1)).toThrow('CHECKSUM_MISMATCH');
    const t2 = clone(); t2.rowCount = 99; expect(() => verifyUnknownResolutionSetV1(t2)).toThrow('ROW_COUNT_MISMATCH');
    const t3 = clone(); t3.rows.reverse(); expect(() => verifyUnknownResolutionSetV1(t3)).toThrow('ROW_ORDER_INVALID');
    const t4 = clone(); t4.setChecksum = '0'.repeat(64); expect(() => verifyUnknownResolutionSetV1(t4)).toThrow('CHECKSUM_MISMATCH');
    const t5 = clone(); t5.canonicalAuthority = true; expect(() => verifyUnknownResolutionSetV1(t5)).toThrow();
    const t6 = clone(); t6.snapshotRevision = 'sha256:' + 'd'.repeat(64); expect(() => verifyUnknownResolutionSetV1(t6)).toThrow('MIXED_SNAPSHOT_REVISION');
    const t7 = clone(); t7.ordinalMapChecksum = 'f'.repeat(64); expect(() => verifyUnknownResolutionSetV1(t7)).toThrow('CHECKSUM_MISMATCH');
    const t8 = clone(); t8.coordinateArtifactChecksum = 'sha256:' + 'f'.repeat(64); expect(() => verifyUnknownResolutionSetV1(t8)).toThrow('CHECKSUM_MISMATCH');
  });
});

describe('ADAPTER-01: unknown_packets -> PACKET_IDENTITY', () => {
  const row = (status: string) => ({ unknown_id: 'u1', workspace_id: 'deeds-web-app', potential_source_ref: 'src/a.ts', potential_packet_key: null, status });
  it('maps the whole existing lifecycle explicitly', () => {
    const m = (s: string) => mapUnknownPacketRowToUnknownResolutionV1(row(s)).status;
    expect([m('OBSERVATION'), m('CANDIDATE'), m('VALIDATED'), m('PROMOTED'), m('REJECTED')]).toEqual(['OPEN', 'RESOLVING', 'RESOLVING', 'RESOLVED', 'SUPERSEDED']);
    expect(() => m('WEIRD')).toThrow('STATUS_UNMAPPED');
  });
  it('is PACKET_IDENTITY, keeps the source row as evidence, carries no snapshot, and is deterministic', () => {
    const a = mapUnknownPacketRowToUnknownResolutionV1(row('OBSERVATION'));
    expect(a.subjectKind).toBe('PACKET_IDENTITY');
    expect(a.snapshotRevision).toBeNull();
    expect(a.evidenceRefs).toEqual(['unknown_packets:u1']);
    expect(a.resolverKind).toBe('PACKET_PROMOTION_PIPELINE');
    expect(mapUnknownPacketRowToUnknownResolutionV1(row('OBSERVATION')).unknownId).toBe(a.unknownId);
    expect(a.reasonCode).toBe('PACKET_IDENTITY_UNRESOLVED');
    expect(mapUnknownPacketRowToUnknownResolutionV1(row('PROMOTED')).resolutionRevision).not.toBeNull();
  });
});
