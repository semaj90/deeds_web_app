import { SPARSE_CONTRACT } from './sparse-contract.mjs';

export function assertSafeCollection(collection) {
  if (!collection || typeof collection !== 'string') {
    throw new Error('Collection is required');
  }
  if (SPARSE_CONTRACT.forbiddenCollections.has(collection)) {
    throw new Error(`Refusing to target degraded collection ${collection}`);
  }
  if (!SPARSE_CONTRACT.allowedCollections.some((prefix) => collection.startsWith(prefix))) {
    throw new Error(`Collection is outside the sparse migration allowlist: ${collection}`);
  }
  return collection;
}

export function assertSparseApplyContext(input) {
  const collection = assertSafeCollection(input.collection);
  const limit = Number(input.limit ?? 0);
  if (!input.apply) {
    return { collection, apply: false, limit };
  }
  if (!input.corpusRevision) {
    throw new Error('apply requires corpusRevision');
  }
  if (!input.representationRevision) {
    throw new Error('apply requires representationRevision');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('apply requires a positive bounded limit');
  }
  return { collection, apply: true, limit };
}
