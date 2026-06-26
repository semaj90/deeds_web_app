/**
 * ACE (Agent Context Engine) Public Barrel
 * Separation of concerns: retrieval finds candidates, ACE packages/validates, Gemma4 synthesizes
 *
 * Phase 1 (✅ Complete): Reader, Writer, Validator — smoke-tested
 * Phase 2 (⏳ In Progress): Context Assembler, Materializer — wiring retrieval loop
 * Phase 3: GPU acceleration (P5)
 */

// ── HyperRAG RPC Contract ──────────────────────────────────────────────────────

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

// ── ACE Atlas Packets (Canonical Truth) ────────────────────────────────────────

export type {
  AtlasPacket,
  NewAtlasPacket,
  AtlasIdentityLane,
} from '$lib/server/db/schema/atlas-packets.js';

// ── Phase 1: ACE Core Infrastructure (✅ Complete) ────────────────────────────

// Phase 1.1: ACE Packet Reader — load packets from Postgres/Redis caches
export { AcePacketReader, createAcePacketReader } from './ace-packet-reader.js';
export type { AcePacketReaderOptions, PacketLoadResult } from './ace-packet-reader.js';

// Phase 1.2: ACE Packet Writer — persist packets to Postgres/Redis
export { AcePacketWriter, createAcePacketWriter } from './ace-packet-writer.js';
export type { AcePacketWriterOptions, PacketPersistResult } from './ace-packet-writer.js';

// Phase 1.3: ACE Packet Validator — injection guard + schema validation (smoke-tested)
export { AcePacketValidator, createAcePacketValidator } from './ace-packet-validator.js';
export type { ValidationResult, SafetyCheckResult } from './ace-packet-validator.js';

// ── Phase 2: ACE Retrieval Integration (⏳ In Progress) ────────────────────────

// Phase 2.1: Context Assembler — convert retrieval hits into bounded ACE context
export { AceContextAssembler, createAceContextAssembler } from './ace-context-assembler.js';
export type { AssemblyOptions, AssembledContext } from './ace-context-assembler.js';

// Phase 2.2: ACE Materializer — sync packet_key/feature_id/source_ref to Qdrant/TurboVec
export {
  materializePacket,
  materializePackets,
  getPacketMaterializationStatus,
  invalidateMaterializedPacket
} from './ace-materializer.js';
export type { MaterializeOptions, MaterializeResult } from './ace-materializer.js';

// ── Observability ──────────────────────────────────────────────────────────────

// ACE Retrieval Logger — traces retrieval candidates through processing (optional)
export { AceRetrievalLogger, createAceRetrievalLogger } from './ace-retrieval-logger.js';
export type { RetrievalLogEntry, LogQueryOptions } from './ace-retrieval-logger.js';
