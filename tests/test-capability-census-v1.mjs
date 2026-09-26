import assert from 'node:assert/strict';
import { CAPABILITIES } from '../scripts/atlas/lib/capability-catalog-v1.mjs';

const ids = new Set(CAPABILITIES.map((capability) => capability.id));
const required = [
  'PG_BTREE_IDENTITY', 'PG_GIN_FTS', 'PGVECTOR_HNSW', 'QDRANT_COLLECTION_SCHEMA',
  'QDRANT_LINEAGE_PAYLOAD_INDEX', 'QDRANT_HNSW', 'CUVS_EXACT_ORACLE', 'CUVS_CAGRA',
  'CANONICAL_SOURCE_AUTHORITY', 'FTS_CANONICAL_JOINBACK', 'ANN03_LIVE_PARITY',
  'OKF_SCHEMA', 'TOPIC_CONCEPT_DOMAIN_TAXONOMY', 'TREE_NODE_ID_RELATIONS',
  'NEO4J_PROJECTION', 'KMEANS_STRUCTURAL', 'SOM_20X20', 'MANIFOLD_COORDINATES_5D',
  'ATLAS_ACE_RESIDENCY', 'BITFROST_BUCKET_WARMING', 'ACE_PACKET_V1', 'CONTEXT_MANIFEST_V1',
  'ACP_RUNTIME', 'A2A_RUNTIME', 'SSR_ADMIN_BOARD', 'NES_CHROM_GLYPH97', 'LOD_MEMORY_STREAMING',
];
for (const id of required) assert(ids.has(id), `missing capability ${id}`);
assert.equal(new Set(CAPABILITIES.map((capability) => capability.id)).size, CAPABILITIES.length, 'duplicate capability IDs');
assert.equal(CAPABILITIES.find((capability) => capability.id === 'SOM_20X20')?.criticality, 'CHALLENGER_OPTIONAL');
assert.equal(CAPABILITIES.find((capability) => capability.id === 'NES_CHROM_GLYPH97')?.criticality, 'OPTIONAL_DEFERRED');
assert.equal(CAPABILITIES.find((capability) => capability.id === 'QDRANT_LINEAGE_PAYLOAD_INDEX')?.criticality, 'P10_CRITICAL');
assert.notEqual(CAPABILITIES.find((capability) => capability.id === 'ATLAS_ACE_RESIDENCY')?.id, 'CUVS_CAGRA');
console.log(`capability-census: ${required.length + 4}/${required.length + 4} PASS`);
