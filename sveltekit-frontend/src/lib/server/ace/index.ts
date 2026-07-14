/**
 * ACE (Agent Context Engine) Public Barrel
 * Separation of concerns: retrieval finds candidates, ACE packages/validates, token remapping exports
 *
 * Phase 1 (✅ Complete): Reader, Writer, Validator — smoke-tested
 * Phase 2 (⏳ In Progress): Token remapping for RL datasets
 * Phase 3: GPU acceleration (P5)
 *
 * For serialization-only boundaries (token remapping, mmap export), use packet-io.ts instead.
 * This barrel maintains full scope; packet-io.ts is a narrow I/O boundary.
 */

// ── ACE Atlas Packets (Canonical Truth) ────────────────────────────────────

export type {
  AtlasPacket,
  NewAtlasPacket,
  AtlasIdentityLane,
} from '$lib/server/db/schema/atlas-packets.js';

// ── Phase 1: ACE Core Infrastructure (✅ Complete) ────────────────────────

// Phase 1.1: ACE Packet Reader — load packets from Postgres/Redis caches
export { AcePacketReader, createAcePacketReader } from './ace-packet-reader.js';
export type { AcePacketReaderOptions, PacketLoadResult } from './ace-packet-reader.js';

// Phase 1.2: ACE Packet Writer — persist packets to Postgres/Redis
export { AcePacketWriter, createAcePacketWriter } from './ace-packet-writer.js';
export type { AcePacketWriterOptions, PacketPersistResult } from './ace-packet-writer.js';

// Phase 1.3: ACE Packet Validator — injection guard + schema validation (smoke-tested)
export { AcePacketValidator, createAcePacketValidator } from './ace-packet-validator.js';
export type { ValidationResult, SafetyCheckResult } from './ace-packet-validator.js';

// ── Serialization (Token Remapping) ────────────────────────────────────────

// Msgpack binary codec for canonical packet → mmap-backed RL datasets
export {
  encodePacketToMsgpack,
  decodePacketFromMsgpack,
  encodePacketBatchToNdjsonMsgpack,
  decodePacketBatchFromNdjsonMsgpack,
  encodeFP16,
  decodeFP16,
  encodeFP32,
  decodeFP32,
  compareEncodingSizes,
  PacketMsgpackTags,
} from '../serialization/packet-msgpack-codec.js';
export type { PacketTopologyEnvelope } from '../hyperrag/packet-topology-envelope.js';
