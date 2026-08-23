export * from './ace-packet-types';
export * from './ace-packet-validator';
export * from './ace-packet-reader';
export * from './ace-packet-writer';
export * from './ace-materializer';
export * from './cluster-tags-cache';
export * from './context-assembler';
export * from './merge-cluster-candidates';
export * from './token-aware-context-packer';
/**
 * ACE (Agent Context Engine) Public Barrel
 * Central exports for ACE packet reading, writing, validation, and materialization
 * Separation of concerns: retrieval finds candidates, ACE packages/validates
 *
 * Phase 1 (This Week):
 * - ace-packet-reader.ts (load from Postgres/Redis)
 * - ace-packet-writer.ts (persist to Postgres/Redis)
 * - ace-materializer.ts (sync to Qdrant payloads)
 * - context-assembler.ts (refactor + bounds)
 *
 * Phase 2 (Next Week):
 * - Add to four-lane proof (optional Lane 5)
 *
 * Phase 3: GPU acceleration (P5)
 */

export type {
  HyperRAGPacketState,
  HyperRAGPacketPipeline,
  HyperRAGRequest,
  HyperRAGResponse,
  HyperRAGCandidate,
  HyperRAGTimings,
  HyperRAGTimingReport,
  HyperRAGRetrievalContract,
} from '$lib/server/hyperrag/hyperrag-rpc-client.js';

export {
  validateHyperRAGRequest,
  validateHyperRAGResponse,
} from '$lib/server/hyperrag/hyperrag-rpc-client.js';

export { createHyperRAGPacketPipeline } from '$lib/server/hyperrag/hyperrag-packet-pipeline.js';

// Phase 1 ACE modules (to be created)
// export { AcePacketReader, createAcePacketReader } from './ace-packet-reader.js';
// export { AcePacketWriter, createAcePacketWriter } from './ace-packet-writer.js';
// export { AceMaterializer, createAceMaterializer } from './ace-materializer.js';
// export { AcePacketValidator, createAcePacketValidator } from './ace-packet-validator.js';
