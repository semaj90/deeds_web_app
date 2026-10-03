const REPRESENTATIONS = Object.freeze({
  semantic_768: { dimensions: 768, role: 'CANONICAL_SEMANTIC' },
  semantic_512: { dimensions: 512, role: 'DERIVED_SEMANTIC_TRUNCATION' },
  semantic_256: { dimensions: 256, role: 'DERIVED_SEMANTIC_TRUNCATION' },
  semantic_128: { dimensions: 128, role: 'DERIVED_SEMANTIC_TRUNCATION' },
  latent_256: { dimensions: 256, role: 'DERIVED_ROUTING_FEATURE' },
  latent_128: { dimensions: 128, role: 'DERIVED_ROUTING_FEATURE' },
  latent_64: { dimensions: 64, role: 'DERIVED_ROUTING_FEATURE' },
});

const PROVENANCE_FIELDS = Object.freeze([
  'representationRevision',
  'modelRevision',
  'inputChecksum',
  'outputChecksum',
]);

export function inspectEmbeddingRepresentationV1(record, { write = false } = {}) {
  const representation = String(record?.representationId ?? record?.representation_id ?? '');
  const dimensions = Number(record?.dimensions ?? record?.dimension ?? record?.embedding_dimension);
  const descriptor = REPRESENTATIONS[representation] ?? null;
  const errors = [];
  if (dimensions === 383 || representation.includes('383')) errors.push('DIMENSION_383_FORBIDDEN');
  if (dimensions === 384 || representation.includes('384')) {
    errors.push(write ? 'DIMENSION_384_WRITE_FORBIDDEN' : 'DIMENSION_384_LEGACY_ONLY');
  }
  if (!descriptor) errors.push('REPRESENTATION_UNKNOWN');
  else if (dimensions !== descriptor.dimensions) errors.push('REPRESENTATION_DIMENSION_MISMATCH');
  for (const field of PROVENANCE_FIELDS) {
    if (!String(record?.[field] ?? '').trim()) errors.push(`MISSING_${field.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`);
  }
  return {
    schema: 'atlas.embedding-representation-validation.v1',
    representationId: representation || null,
    dimensions: Number.isFinite(dimensions) ? dimensions : null,
    role: descriptor?.role ?? (dimensions === 384 ? 'LEGACY_ONLY' : 'UNKNOWN'),
    canonical: representation === 'semantic_768' && dimensions === 768,
    accepted: errors.length === 0,
    errors,
  };
}

export function listEmbeddingRepresentationsV1() {
  return Object.entries(REPRESENTATIONS).map(([representationId, value]) => ({ representationId, ...value }));
}
