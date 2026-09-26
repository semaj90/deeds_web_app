/** Public schema-contract entrypoint for package consumers. */
export {
  TURBOVEC_EMBEDDING_MODEL,
  TURBOVEC_EMBEDDING_DIMENSION,
  TURBOVEC_QUANTIZER,
  TURBOVEC_ROTATION_SEED,
  assertTurboVecEmbedding,
  buildTurboVecPackedRef,
  buildTurboVecMetadata,
} from './turbovec-contract.js';
export type { TurboVecMetadata } from './turbovec-contract.js';
