import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PacketLodV1, ResidencyStateV1 } from './residency/packet-lod-v1.js';

/**
 * PacketControlWordV1 — a compiled control-record projection over an already-canonical Parent
 * Atlas packet. See openspec/changes/parent-atlas-packet-control-word-record/ for the full
 * proposal, the naming-collision findings (this is NOT the evidence-cartridge GlyphRecord/CHR97
 * system in src/lib/server/cartridge/, a real, live, different-domain system — see that change's
 * design.md), and the reuse audit this module's LOD/residency encoding builds on.
 *
 * MUST NOT carry a raw source excerpt, embedding vector, or summary text — only presence flags
 * and small enumerations. MUST NOT import from src/lib/server/cartridge/*.
 */

export const PACKET_CONTROL_WORD_SCHEMA = 'atlas.packet-control-word.v1' as const;

/** Bit positions in the 64-bit feature-presence bitset. */
export const PACKET_CONTROL_WORD_BIT_V1 = {
  UTF8_VALID: 0,
  TITLE_BOUND: 1,
  SOURCE_REVISION_PROVEN: 2,
  AST_PRESENT: 3,
  CST_PRESENT: 4,
  LSP_PRESENT: 5,
  LEXICAL_PRESENT: 6,
  TRIGRAM_PRESENT: 7,
  DOMAIN_PRESENT: 8,
  TAXONOMY_PRESENT: 9,
  ONTOLOGY_PRESENT: 10,
  GRAPH_PRESENT: 11,
  HYPEREDGE_PRESENT: 12,
  LATENT64_PRESENT: 13,
  SEMANTIC768_PRESENT: 14,
  RERANK_PRESENT: 15,
  VALIDATED: 63,
} as const satisfies Record<string, number>;
export type PacketControlWordBitV1 = keyof typeof PACKET_CONTROL_WORD_BIT_V1;

/**
 * LOD nibble encoding — reuses the existing PacketLodV1 vocabulary
 * (residency/packet-lod-v1.ts) rather than inventing a second LOD scale. 0-5 map directly;
 * 'GPU' (the sentinel non-numeric LOD state) maps to 15, the nibble's max value.
 */
const LOD_TO_NIBBLE: Record<string, number> = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, GPU: 15 };
const NIBBLE_TO_LOD: Record<number, PacketLodV1> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 15: 'GPU' };

export function lodToNibble(lod: PacketLodV1): number {
  const value = LOD_TO_NIBBLE[String(lod)];
  if (value === undefined) throw new Error(`packet-control-word-v1: unencodable LOD value ${String(lod)}`);
  return value;
}
export function nibbleToLod(nibble: number): PacketLodV1 {
  const value = NIBBLE_TO_LOD[nibble];
  if (value === undefined) throw new Error(`packet-control-word-v1: unrecognized LOD nibble ${nibble}`);
  return value;
}

/** Residency nibble encoding — reuses the existing ResidencyStateV1 vocabulary. */
const RESIDENCY_TO_NIBBLE: Record<ResidencyStateV1, number> = {
  ABSENT: 0,
  COLD: 1,
  WARM: 2,
  HOT_CPU: 3,
  HOT_GPU: 4,
  CONSUMED: 5,
};
const NIBBLE_TO_RESIDENCY: Record<number, ResidencyStateV1> = {
  0: 'ABSENT',
  1: 'COLD',
  2: 'WARM',
  3: 'HOT_CPU',
  4: 'HOT_GPU',
  5: 'CONSUMED',
};

export function residencyToNibble(residency: ResidencyStateV1): number {
  return RESIDENCY_TO_NIBBLE[residency];
}
export function nibbleToResidency(nibble: number): ResidencyStateV1 {
  const value = NIBBLE_TO_RESIDENCY[nibble];
  if (value === undefined) throw new Error(`packet-control-word-v1: unrecognized residency nibble ${nibble}`);
  return value;
}

export const PacketControlWordV1Schema = z
  .object({
    schema: z.literal(PACKET_CONTROL_WORD_SCHEMA),
    packetRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    controlWordSchemaRevision: z.string().min(1),
    featureBits: z.bigint(),
    lodNibble: z.number().int().min(0).max(15),
    residencyNibble: z.number().int().min(0).max(15),
    domainByte: z.number().int().min(0).max(255),
    routingByte: z.number().int().min(0).max(255),
    checksum: z.string().min(1),
  })
  .strict();
export type PacketControlWordV1 = z.infer<typeof PacketControlWordV1Schema>;

function computeChecksum(fields: Omit<PacketControlWordV1, 'schema' | 'checksum'>): string {
  const canonical = JSON.stringify({
    packetRevision: fields.packetRevision,
    featureRevision: fields.featureRevision,
    controlWordSchemaRevision: fields.controlWordSchemaRevision,
    featureBits: fields.featureBits.toString(),
    lodNibble: fields.lodNibble,
    residencyNibble: fields.residencyNibble,
    domainByte: fields.domainByte,
    routingByte: fields.routingByte,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * PacketControlWordEncoderV1 — the only function that sets bits/nibbles/bytes on a control word.
 * Takes already-resolved typed feature-presence flags (from canonical Postgres/Qdrant/Neo4j
 * reads elsewhere) as input; does not read raw source/embeddings itself.
 */
export function encodePacketControlWordV1(input: {
  packetRevision: string;
  featureRevision: string;
  controlWordSchemaRevision: string;
  presentBits: readonly PacketControlWordBitV1[];
  lod: PacketLodV1;
  residency: ResidencyStateV1;
  domainByte: number;
  routingByte: number;
}): PacketControlWordV1 {
  let featureBits = 0n;
  for (const bitName of input.presentBits) {
    featureBits |= 1n << BigInt(PACKET_CONTROL_WORD_BIT_V1[bitName]);
  }

  const base = {
    packetRevision: input.packetRevision,
    featureRevision: input.featureRevision,
    controlWordSchemaRevision: input.controlWordSchemaRevision,
    featureBits,
    lodNibble: lodToNibble(input.lod),
    residencyNibble: residencyToNibble(input.residency),
    domainByte: input.domainByte,
    routingByte: input.routingByte,
  };

  return PacketControlWordV1Schema.parse({
    schema: PACKET_CONTROL_WORD_SCHEMA,
    ...base,
    checksum: computeChecksum(base),
  });
}

/**
 * PacketControlWordDecoderV1 — the exact inverse for typed control fields only. Never returns an
 * embedding, AST, source text, or summary — those remain artifact references resolved elsewhere.
 */
export function decodePacketControlWordV1(word: PacketControlWordV1): {
  presentBits: PacketControlWordBitV1[];
  lod: PacketLodV1;
  residency: ResidencyStateV1;
  domainByte: number;
  routingByte: number;
} {
  const presentBits = (Object.keys(PACKET_CONTROL_WORD_BIT_V1) as PacketControlWordBitV1[]).filter(
    (name) => (word.featureBits & (1n << BigInt(PACKET_CONTROL_WORD_BIT_V1[name]))) !== 0n,
  );
  return {
    presentBits,
    lod: nibbleToLod(word.lodNibble),
    residency: nibbleToResidency(word.residencyNibble),
    domainByte: word.domainByte,
    routingByte: word.routingByte,
  };
}

export function isPacketControlWordBitSet(word: PacketControlWordV1, bit: PacketControlWordBitV1): boolean {
  return (word.featureBits & (1n << BigInt(PACKET_CONTROL_WORD_BIT_V1[bit]))) !== 0n;
}

/**
 * renderPacketControlWordDebugGrid — task 2.3, debug/visualization ONLY. Renders the 64-bit
 * featureBits as an 8x8 grid of '#'/'.' (bit 0 at row 0 col 0, bit 63 at row 7 col 7, row-major).
 * This is NOT an alternate encoding and NOT a cartridge/tile file format — it exists purely so a
 * human (or a log line) can eyeball which bits are set without manually shifting a bigint. Never
 * parse this string back into a PacketControlWordV1; round-trip only through the encoder/decoder.
 */
export function renderPacketControlWordDebugGrid(word: PacketControlWordV1): string {
  const rows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let line = '';
    for (let col = 0; col < 8; col++) {
      const bitPosition = row * 8 + col;
      line += (word.featureBits & (1n << BigInt(bitPosition))) !== 0n ? '#' : '.';
    }
    rows.push(line);
  }
  return rows.join('\n');
}
