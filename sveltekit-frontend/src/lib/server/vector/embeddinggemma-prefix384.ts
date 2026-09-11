// Compatibility shim retained for older imports and frozen reports.
//
// Canonical EmbeddingGemma representation ownership moved to
// `embeddinggemma-contracts.ts`. Native/canonical output is semantic_768.
// Official MRL-derived reference widths are 512, 256, and 128. The historical
// Atlas 768->384 direct-slice lane is migration-only and cannot be produced by
// the normal runtime projection helper.

export {
  EMBEDDINGGEMMA_FULL768_V1,
  EMBEDDINGGEMMA_FULL768_CONTRACT,
  EMBEDDINGGEMMA_MRL512_CONTRACT,
  EMBEDDINGGEMMA_MRL256_CONTRACT,
  EMBEDDINGGEMMA_MRL128_CONTRACT,
  EMBEDDINGGEMMA_MRL_DIMENSIONS,
  ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1,
  EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT,
  EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_SNAPSHOT,
  projectEmbeddingForContract,
  projectLegacyDirectSlice384ForMigration,
  type EmbeddingGemmaMrlDimension,
  type EmbeddingGemmaProjectionContract,
} from './embeddinggemma-contracts.js';

// Deprecated aliases kept only so frozen migration/replay code can still
// decode historical receipts. New code must use the explicitly LEGACY names.
export {
  ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1 as ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1,
  ATLAS_EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_V1 as EMBEDDINGGEMMA_PREFIX384_V1,
  EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_CONTRACT as EMBEDDINGGEMMA_PREFIX384_CONTRACT,
  EMBEDDINGGEMMA_LEGACY_DIRECT_SLICE384_SNAPSHOT as EMBEDDINGGEMMA_PREFIX384_SNAPSHOT,
} from './embeddinggemma-contracts.js';
