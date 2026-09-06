import crypto from 'node:crypto';

export const REPRESENTATION_KINDS = Object.freeze([
  'lexical', 'sparse', 'semantic', 'ast', 'nlp', 'ontology', 'graph', 'summary', 'lod', 'openspec_task',
]);

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function buildRepresentationDescriptorV1(input) {
  if (!REPRESENTATION_KINDS.includes(input.kind)) throw new Error('REPRESENTATION_KIND_UNSUPPORTED');
  for (const field of ['chunkId', 'sourceRevision', 'producerRevision']) {
    if (typeof input[field] !== 'string' || !input[field]) throw new Error(`REPRESENTATION_${field.toUpperCase()}_REQUIRED`);
  }
  const descriptor = {
    schema: 'atlas.representation-descriptor.v1',
    descriptorId: `representation:${sha256({ chunkId: input.chunkId, sourceRevision: input.sourceRevision, kind: input.kind, producerRevision: input.producerRevision })}`,
    chunkId: input.chunkId,
    sourceRevision: input.sourceRevision,
    kind: input.kind,
    producerRevision: input.producerRevision,
    status: input.status ?? 'ACTIVE',
    dependencyRevisions: [...(input.dependencyRevisions ?? [])].sort(),
    projectionRefs: [...(input.projectionRefs ?? [])]
      .sort((a, b) => `${a.system}/${a.id}`.localeCompare(`${b.system}/${b.id}`))
      .map((ref) => ({ ...ref, canonicalAuthority: false })),
    canonicalAuthority: false,
  };
  if (!['ACTIVE', 'SUPERSEDED', 'REJECTED'].includes(descriptor.status)) throw new Error('REPRESENTATION_STATUS_UNSUPPORTED');
  return descriptor;
}

export function assertNoDuplicateActiveRepresentationsV1(descriptors) {
  const active = new Set();
  for (const descriptor of descriptors) {
    if (descriptor.status !== 'ACTIVE') continue;
    const key = [descriptor.chunkId, descriptor.sourceRevision, descriptor.kind, descriptor.producerRevision].join('\u0000');
    if (active.has(key)) throw new Error('REPRESENTATION_DUPLICATE_ACTIVE_OWNER');
    active.add(key);
  }
  return true;
}

export function representationInvalidationKeyV1(descriptor) {
  return [descriptor.chunkId, descriptor.sourceRevision, descriptor.kind, descriptor.producerRevision].join(':');
}
