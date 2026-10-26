import { candidateFeatureSnapshotV1Schema, type CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import {
  aceContextManifestAdmissionV1Schema,
  type AceContextManifestAdmissionV1,
} from '../context/ace-context-manifest-admission-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  descriptorCacheKey,
  routeDomainWithLut,
  validateUnifiedDescriptor,
  type DomainLutEntry,
  type UnifiedResidencyDescriptor,
} from './unified-residency-adapter-v1.js';

export interface UnifiedResidencyAceBridgeInputV1 {
  snapshot: CandidateFeatureSnapshotV1;
  admission: AceContextManifestAdmissionV1;
  domain: string;
  lutRevision: string;
  lut: Readonly<Record<string, DomainLutEntry>>;
  representationRevision: string;
  modelRevision: string;
  tokenizerRevision: string;
  ropeRevision: string;
  artifactChecksum?: string;
  dtype?: 'float32' | 'float16' | 'bfloat16';
}

export interface UnifiedResidencyAceBridgeResultV1 {
  routing: ReturnType<typeof routeDomainWithLut>;
  descriptors: UnifiedResidencyDescriptor[];
  admission: AceContextManifestAdmissionV1;
  canonicalAuthority: false;
  writesPerformed: false;
}

/**
 * Connects an already admitted ACE feature snapshot to logical residency.
 * This is intentionally a descriptor bridge: it neither searches nor writes
 * ACE, BitFrost, Valkey, PostgreSQL, or physical GPU memory.
 */
export function prepareUnifiedResidencyAceBridgeV1(input: UnifiedResidencyAceBridgeInputV1): UnifiedResidencyAceBridgeResultV1 {
  const snapshot = candidateFeatureSnapshotV1Schema.parse(input.snapshot);
  const admission = aceContextManifestAdmissionV1Schema.parse(input.admission);
  if (admission.canonicalAuthority) throw new Error('ACE_CANONICAL_AUTHORITY_NOT_ALLOWED');
  const manifest = admission.manifest;
  if (manifest.v1.snapshotId !== snapshot.candidateSnapshotRevision) throw new Error('ACE_SNAPSHOT_ID_MISMATCH');
  if (manifest.identityInput.ordinalMapChecksum !== snapshot.ordinalMapChecksum) throw new Error('ACE_ORDINAL_MAP_CHECKSUM_MISMATCH');

  const rowsById = new Map<string, CandidateFeatureSnapshotV1['rows'][number]>();
  for (const row of snapshot.rows) {
    if (rowsById.has(row.canonicalId)) throw new Error('ACE_SNAPSHOT_CANONICAL_ID_AMBIGUOUS');
    rowsById.set(row.canonicalId, row);
  }
  const selectedIds = manifest.v1.selectedNodeKeys;
  if (selectedIds.length !== manifest.v1.candidateCount || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('ACE_SELECTED_CANDIDATE_SET_INVALID');
  }
  const selectedRows = selectedIds.map((id) => {
    const row = rowsById.get(id);
    if (!row) throw new Error('ACE_SELECTED_CANDIDATE_NOT_IN_SNAPSHOT');
    return row;
  });
  const selectedOrdinals = selectedRows.map((row) => row.candidateOrdinal).sort((a, b) => a - b);
  const selectedOrdinalSetChecksum = canonicalSha256V1({
    schema: 'atlas.ace-context-selected-ordinal-set.v1',
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    ordinals: selectedOrdinals,
  });
  if (selectedOrdinalSetChecksum !== admission.selectedOrdinalSetChecksum) {
    throw new Error('ACE_SELECTED_ORDINAL_SET_CHECKSUM_MISMATCH');
  }
  const sourceRevisionSetChecksum = canonicalSha256V1({
    schema: 'atlas.ace-context-source-revision-set.v1',
    revisions: [...new Set(selectedRows.map((row) => row.sourceRevision))].sort(),
  });
  if (sourceRevisionSetChecksum !== admission.sourceRevisionSetChecksum) {
    throw new Error('ACE_SOURCE_REVISION_SET_CHECKSUM_MISMATCH');
  }
  const routing = routeDomainWithLut({ domain: input.domain, lutRevision: input.lutRevision, table: input.lut });
  // The current Python GpuTileCache owner is float32; narrower storage remains
  // a separate provider capability and must not be silently widened here.
  const dtype = input.dtype ?? 'float32';
  const bytesPerValue = dtype === 'float32' ? 4 : 2;
  const artifactChecksum = input.artifactChecksum ?? snapshot.snapshotChecksum;
  const descriptors = selectedRows.map((row) => {
    const descriptor: UnifiedResidencyDescriptor = {
      schema: 'atlas.unified-residency.v1',
      residencyKey: '',
      kind: 'FEATURE_TILE',
      workspaceRevision: row.workspaceRevision,
      sourceRevision: row.sourceRevision,
      representationRevision: input.representationRevision,
      featureRevision: row.featureRevision,
      modelRevision: input.modelRevision,
      tokenizerRevision: input.tokenizerRevision,
      ropeRevision: input.ropeRevision,
      candidateOrdinal: row.candidateOrdinal,
      artifactChecksum,
      shape: [1, routing.tileWidth],
      dtype,
      byteLength: routing.tileWidth * bytesPerValue,
      state: 'EMPTY',
    };
    descriptor.residencyKey = descriptorCacheKey(descriptor);
    validateUnifiedDescriptor(descriptor);
    return descriptor;
  });
  return { routing, descriptors, admission, canonicalAuthority: false, writesPerformed: false };
}
