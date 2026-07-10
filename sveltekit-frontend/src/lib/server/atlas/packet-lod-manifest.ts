import crypto from 'crypto';
import type { PacketLodManifest } from '$lib/runtime-cache/contracts';
import { PacketLodManifestSchema, LOD_LEVELS } from '$lib/runtime-cache/contracts';

/**
 * LOD Manifest Emission — Retrieve Chain Integration
 *
 * Called after packet is selected as winner in retrieval pipeline.
 * Emits progressive LOD levels (0=identity, 1=summary, 2=context, 3=full).
 */

export function determineLod(destination: string): '0' | '1' | '2' | '3' {
  switch (destination) {
    case 'browser-l1':
      return '2'; // Context level for hot
    case 'valkey-hot':
      return '1'; // Summary level
    case 'valkey-warm':
      return '0'; // Identity only
    case 'analytics-only':
      return '0'; // Identity only
    case 'cold-archive':
      return '3'; // Full content for archive
    default:
      return '0';
  }
}

export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 chars per token (GPT tokenizer average)
  return Math.ceil(text.length / 4);
}

export async function buildPacketLodManifest(
  packet: {
    packet_key: string;
    source_ref: string;
    feature_id?: string;
    tree_node_id?: string;
    summary?: string;
    content?: string;
    som_row?: number;
    som_col?: number;
    community_id?: number;
  },
  options: {
    destination: 'browser-l1' | 'valkey-hot' | 'valkey-warm' | 'analytics-only' | 'cold-archive';
    rank: number;
    score: number;
  }
): Promise<PacketLodManifest | null> {
  try {
    const lod = determineLod(options.destination);
    const content = packet.content || packet.summary || '';
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const byteLength = Buffer.byteLength(content, 'utf-8');
    const tokenCount = estimateTokenCount(content);

    const manifest: PacketLodManifest = {
      packetKey: packet.packet_key,
      sourceRef: packet.source_ref,
      featureId: packet.feature_id,
      treeNodeId: packet.tree_node_id,

      lod,
      cacheClass:
        options.destination === 'browser-l1'
          ? 'hot'
          : options.destination === 'valkey-hot'
            ? 'warm'
            : 'cold',

      contentHash,
      byteLength,
      tokenCount,

      somRow: packet.som_row,
      somCol: packet.som_col,
      communityId: packet.community_id,

      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (options.destination === 'browser-l1' ? 3600000 : 86400000)).toISOString(),
      promotionState: 'winner'
    };

    // Validate against schema
    return PacketLodManifestSchema.parse(manifest);
  } catch (err) {
    console.error('Failed to build LOD manifest:', err);
    return null;
  }
}

/**
 * LOD0 Fast-Path — Identity Only (no content fetch)
 *
 * Used when result list is being populated. Avoids content materialization.
 */

export function buildLod0Manifest(packet: {
  packet_key: string;
  source_ref: string;
  title?: string;
}): PacketLodManifest {
  return {
    packetKey: packet.packet_key,
    sourceRef: packet.source_ref,

    lod: '0',
    cacheClass: 'warm',

    contentHash: '',
    byteLength: 0,

    generatedAt: new Date().toISOString(),
    promotionState: 'winner'
  };
}

/**
 * LOD1 Summary-Only — Hover Preview
 *
 * Includes summary + metadata, no full content.
 */

export function buildLod1Manifest(packet: {
  packet_key: string;
  source_ref: string;
  summary?: string;
  keywords?: string[];
  domain?: string;
}): PacketLodManifest {
  const summary = packet.summary || '';
  return {
    packetKey: packet.packet_key,
    sourceRef: packet.source_ref,

    lod: '1',
    cacheClass: 'warm',

    contentHash: crypto.createHash('sha256').update(summary).digest('hex'),
    byteLength: Buffer.byteLength(summary, 'utf-8'),
    tokenCount: estimateTokenCount(summary),

    generatedAt: new Date().toISOString(),
    promotionState: 'winner'
  };
}

/**
 * Synthesis Manifest Token Budget
 *
 * LOD2/3 must respect budget constraint:
 * - Per-packet max: 1024 tokens (LOD2) or full (LOD3)
 * - Entire context max: 4800 tokens (BitFrost constraint)
 */

export function isSynthesisManifestWithinBudget(
  manifest: PacketLodManifest,
  budgetTokens: number = 1024
): boolean {
  return (manifest.tokenCount ?? 0) <= budgetTokens;
}
