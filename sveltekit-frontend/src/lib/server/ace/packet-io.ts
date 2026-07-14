/**
 * ACE Packet I/O Boundary — Serialization Layer Entry Point
 *
 * Narrow public surface for canonical packet round-tripping:
 * - Reader: Load promoted packets from canonical store (Postgres)
 * - Writer: Persist validated packets to canonical store
 * - Validator: Schema + safety gates before write
 * - Codec: MsgPack binary transport (FP16/FP32) for RL datasets
 *
 * DO NOT export: HyperRAG, context assembly, materialization, ranking, domain classification
 * DO NOT re-introduce: old ACE barrel dependencies
 *
 * This is a serialization boundary only. Retrieval logic lives elsewhere.
 */

// ── I/O Primitives ────────────────────────────────────────────────────────

export {
  AcePacketReader,
  createAcePacketReader,
} from './ace-packet-reader.js';
export type { AcePacketReaderOptions, PacketLoadResult } from './ace-packet-reader.js';

export {
  AcePacketWriter,
  createAcePacketWriter,
} from './ace-packet-writer.js';
export type { AcePacketWriterOptions, PacketPersistResult } from './ace-packet-writer.js';

export {
  AcePacketValidator,
  createAcePacketValidator,
} from './ace-packet-validator.js';
export type { ValidationResult, SafetyCheckResult } from './ace-packet-validator.js';

// ── Serialization (Token Remapping Ready) ─────────────────────────────────

export {
  encodePacketToMsgpack,
  encodePacketBatchToNdjsonMsgpack,
  decodePacketFromMsgpack,
  decodeFP16,
  decodeFP32,
  encodeFP16,
  encodeFP32,
  PacketMsgpackTags,
} from '../serialization/packet-msgpack-codec.js';

export type { PacketTopologyEnvelope } from '../hyperrag/packet-topology-envelope.js';

// ── Enrichment (Title Identity Generation, Promotion Service Only) ────────

export {
  generateTitleIdentity,
  generateTitleFromEnvelope,
  TITLE_GENERATOR_VERSION,
} from './title-id-generator.js';
export type { GeneratedTitle } from './title-id-generator.js';
export type {
  CanonicalDomain,
  DomainClassification,
  DomainEvidence,
} from '../atlas/domain-taxonomy.js';

/**
 * Semantic enrichment envelope
 *
 * Applied asynchronously during promotion/enrichment phase.
 * Fields are optional to avoid blocking retrieval candidates.
 * Persisted to atlas_packets during canonical packet write-through.
 */
export interface PacketSemanticEnrichment {
  semanticTitle?: string;
  semanticSlug?: string;
  titleId?: string;
  titleGeneratorVersion?: string;
  domainClass?: string;
  domainClassification?: import('../atlas/domain-taxonomy.js').DomainClassification;
  domainClassSource?: import('../atlas/domain-taxonomy.js').NormalizedDomainLabel['normalization'];
  classifierVersion?: string;
}

// ── Promotion Enrichment Service ──────────────────────────────────────────

export {
  enrichPacketSemantics,
  enrichPacketBatch,
  extractAtlasWriteData,
  TITLE_GENERATOR_VERSION,
} from './promotion-enrichment-service.js';
export type { PacketAtlasWrite } from './promotion-enrichment-service.js';
