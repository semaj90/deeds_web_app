import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  buildPacketClassLutV1,
  type PacketClassLutV1,
  lutEncode,
  lutDecode,
} from './packet-class-lut-v1.js';

/**
 * CODEBOOK-LUTS-V1
 * 
 * Modular codebook LUTs with independent bit budgets:
 * - DomainClassLUT: 0..31 (5 bits)
 * - SourceRoleLUT: 0..15 (4 bits)
 * - RelationTypeLUT: 0..63 (6 bits)
 * - EvidenceKindLUT: 0..31 (5 bits)
 * - ExecutionCapabilityLUT: 0..255 (8 bits / uint8)
 * - HotConceptCodebook: 0..511 (9 bits / uint16)
 * 
 * Includes 12-byte packed header encoder/decoder:
 * [archetype:u8][domain:u8][relation:u8][flags:u8][conceptOrdinal:u16][entityOrdinal:u16][packetOrdinal:u32]
 */

export const PackedHeaderSchema = z
  .object({
    archetype: z.number().int().min(0).max(255),
    domain: z.number().int().min(0).max(255),
    relation: z.number().int().min(0).max(255),
    flags: z.number().int().min(0).max(255),
    conceptOrdinal: z.number().int().min(0).max(65535),
    entityOrdinal: z.number().int().min(0).max(65535),
    packetOrdinal: z.number().int().min(0).max(4294967295),
  })
  .strict();

export type PackedHeader = z.infer<typeof PackedHeaderSchema>;

export function createDomainClassLUT(labels: readonly string[]): PacketClassLutV1 {
  if (labels.length > 32) throw new Error(`DomainClassLUT exceeds 32 capacity: ${labels.length}`);
  return buildPacketClassLutV1(labels);
}

export function createSourceRoleLUT(labels: readonly string[]): PacketClassLutV1 {
  if (labels.length > 16) throw new Error(`SourceRoleLUT exceeds 16 capacity: ${labels.length}`);
  return buildPacketClassLutV1(labels);
}

export function createRelationTypeLUT(labels: readonly string[]): PacketClassLutV1 {
  if (labels.length > 64) throw new Error(`RelationTypeLUT exceeds 64 capacity: ${labels.length}`);
  return buildPacketClassLutV1(labels);
}

export function createEvidenceKindLUT(labels: readonly string[]): PacketClassLutV1 {
  if (labels.length > 32) throw new Error(`EvidenceKindLUT exceeds 32 capacity: ${labels.length}`);
  return buildPacketClassLutV1(labels);
}

export function createExecutionCapabilityLUT(labels: readonly string[]): PacketClassLutV1 {
  if (labels.length > 256) throw new Error(`ExecutionCapabilityLUT exceeds 256 capacity: ${labels.length}`);
  return buildPacketClassLutV1(labels);
}

/**
 * 12-byte packed header encoding:
 * Offset 0: archetype (u8)
 * Offset 1: domain (u8)
 * Offset 2: relation (u8)
 * Offset 3: flags (u8)
 * Offset 4: conceptOrdinal (u16 LE)
 * Offset 6: entityOrdinal (u16 LE)
 * Offset 8: packetOrdinal (u32 LE)
 * Total: 12 bytes
 */
export function encodePackedHeader(header: PackedHeader): Uint8Array {
  PackedHeaderSchema.parse(header);
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);

  view.setUint8(0, header.archetype);
  view.setUint8(1, header.domain);
  view.setUint8(2, header.relation);
  view.setUint8(3, header.flags);
  view.setUint16(4, header.conceptOrdinal, true);
  view.setUint16(6, header.entityOrdinal, true);
  view.setUint32(8, header.packetOrdinal, true);

  return new Uint8Array(buffer);
}

export function decodePackedHeader(bytes: Uint8Array): PackedHeader {
  if (bytes.length < 12) {
    throw new Error(`Packed header must be at least 12 bytes, got ${bytes.length}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, 12);
  const header: PackedHeader = {
    archetype: view.getUint8(0),
    domain: view.getUint8(1),
    relation: view.getUint8(2),
    flags: view.getUint8(3),
    conceptOrdinal: view.getUint16(4, true),
    entityOrdinal: view.getUint16(6, true),
    packetOrdinal: view.getUint32(8, true),
  };
  return PackedHeaderSchema.parse(header);
}
