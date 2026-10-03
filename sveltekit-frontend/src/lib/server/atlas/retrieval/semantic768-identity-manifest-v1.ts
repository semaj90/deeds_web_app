import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

export const SEMANTIC768_IDENTITY_MANIFEST_SCHEMA = 'atlas.semantic768-identity-manifest.v1' as const;
export const SEMANTIC768_REPRESENTATION_ID = 'semantic_768' as const;
export const SEMANTIC768_DIMENSION = 768 as const;

export type Semantic768MatrixRowV1 = {
  packetKey: string;
  sourceRevision: string;
  vector: number[];
};

export type Semantic768IdentityManifestV1 = {
  schema: typeof SEMANTIC768_IDENTITY_MANIFEST_SCHEMA;
  representationId: typeof SEMANTIC768_REPRESENTATION_ID;
  representationRevision: string;
  dimension: typeof SEMANTIC768_DIMENSION;
  rowCount: number;
  identities: Array<{ packetKey: string; sourceRevision: string }>;
  identityManifestChecksum: string;
  matrixChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
};

function assertFiniteVector(row: Semantic768MatrixRowV1, index: number): void {
  if (row.vector.length !== SEMANTIC768_DIMENSION) {
    throw new Error(`ATLAS_SEMANTIC768_MANIFEST_DIMENSION:${index}`);
  }
  if (row.vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`ATLAS_SEMANTIC768_MANIFEST_NONFINITE:${index}`);
  }
}

function normalizeRows(rows: readonly Semantic768MatrixRowV1[]): Semantic768MatrixRowV1[] {
  if (rows.length === 0) throw new Error('ATLAS_SEMANTIC768_MANIFEST_EMPTY');
  const normalized = rows.map((row, index) => {
    if (!row.packetKey?.trim()) throw new Error(`ATLAS_SEMANTIC768_MANIFEST_PACKET_KEY:${index}`);
    if (!row.sourceRevision?.trim()) throw new Error(`ATLAS_SEMANTIC768_MANIFEST_SOURCE_REVISION:${index}`);
    assertFiniteVector(row, index);
    return {
      packetKey: row.packetKey.normalize('NFC'),
      sourceRevision: row.sourceRevision.normalize('NFC'),
      vector: row.vector.map((value) => (Object.is(value, -0) ? 0 : value)),
    };
  });
  normalized.sort((a, b) => `${a.packetKey}\u0000${a.sourceRevision}`.localeCompare(`${b.packetKey}\u0000${b.sourceRevision}`, 'en'));
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous.packetKey === current.packetKey && previous.sourceRevision === current.sourceRevision) {
      throw new Error(`ATLAS_SEMANTIC768_MANIFEST_DUPLICATE:${current.packetKey}`);
    }
  }
  return normalized;
}

export function buildSemantic768IdentityManifestV1(input: {
  representationRevision: string;
  rows: readonly Semantic768MatrixRowV1[];
}): Semantic768IdentityManifestV1 {
  if (!input.representationRevision?.trim()) throw new Error('ATLAS_SEMANTIC768_MANIFEST_REPRESENTATION_REVISION');
  const rows = normalizeRows(input.rows);
  const identities = rows.map(({ packetKey, sourceRevision }) => ({ packetKey, sourceRevision }));
  const identityManifestChecksum = canonicalSha256V1({
    schema: SEMANTIC768_IDENTITY_MANIFEST_SCHEMA,
    representationId: SEMANTIC768_REPRESENTATION_ID,
    representationRevision: input.representationRevision.normalize('NFC'),
    dimension: SEMANTIC768_DIMENSION,
    identities,
  });
  const matrixChecksum = canonicalSha256V1({
    schema: 'atlas.semantic768-matrix.v1',
    representationId: SEMANTIC768_REPRESENTATION_ID,
    representationRevision: input.representationRevision.normalize('NFC'),
    dimension: SEMANTIC768_DIMENSION,
    rows,
  });
  return {
    schema: SEMANTIC768_IDENTITY_MANIFEST_SCHEMA,
    representationId: SEMANTIC768_REPRESENTATION_ID,
    representationRevision: input.representationRevision.normalize('NFC'),
    dimension: SEMANTIC768_DIMENSION,
    rowCount: rows.length,
    identities,
    identityManifestChecksum,
    matrixChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function assertSemantic768ManifestMatchesRowsV1(
  manifest: Semantic768IdentityManifestV1,
  rows: readonly Semantic768MatrixRowV1[],
): void {
  const rebuilt = buildSemantic768IdentityManifestV1({
    representationRevision: manifest.representationRevision,
    rows,
  });
  if (manifest.identityManifestChecksum !== rebuilt.identityManifestChecksum) {
    throw new Error('ATLAS_SEMANTIC768_MANIFEST_IDENTITY_CHECKSUM_MISMATCH');
  }
  if (manifest.matrixChecksum !== rebuilt.matrixChecksum) {
    throw new Error('ATLAS_SEMANTIC768_MANIFEST_MATRIX_CHECKSUM_MISMATCH');
  }
  if (manifest.rowCount !== rebuilt.rowCount || manifest.dimension !== SEMANTIC768_DIMENSION) {
    throw new Error('ATLAS_SEMANTIC768_MANIFEST_SHAPE_MISMATCH');
  }
}
