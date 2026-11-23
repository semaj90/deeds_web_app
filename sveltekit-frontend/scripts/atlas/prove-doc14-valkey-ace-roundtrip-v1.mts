#!/usr/bin/env node
/**
 * P5 Live Valkey/Redis (:6379) ACE Packet V3 Write, TTL, Readback & Stale-Revision Rejection Proof.
 * Uses the first PostgreSQL-PROVEN DOC-14 chunk from docs/reports/doc14-admitted-chunks.jsonl.
 * Cleans up its temporary test key after readback and writes a receipt to docs/reports/doc14-valkey-ace-readback-v1.json.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { buildAcePacketV3 } from '@deeds/parent-atlas';
import { AcePacketReader } from '../../src/lib/server/ace/ace-packet-reader.js';
import { AcePacketWriter } from '../../src/lib/server/ace/ace-packet-writer.js';
import { type AceBitfrostCacheIdentityV1 } from '../../src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const JSONL_PATH = resolve(ROOT, 'docs/reports/doc14-admitted-chunks.jsonl');
const REPORT_PATH = resolve(ROOT, 'docs/reports/doc14-valkey-ace-readback-v1.json');

async function main(): Promise<void> {
  const firstLine = readFileSync(JSONL_PATH, 'utf8').split(/\r?\n/).find((l) => l.trim().length > 0);
  if (!firstLine) throw new Error('DOC14_ADMITTED_CHUNKS_JSONL_EMPTY');
  const chunk = JSON.parse(firstLine) as {
    chunkId: string;
    sourceRef: string;
    sourceRevision: string;
    contentSha256: string;
    chunkSha256: string;
  };

  const sha = (hex: string) => `sha256:${hex}`;
  const section = <T,>(
    data: T,
    status: 'CURRENT' | 'HINT' | 'STALE' | 'PENDING' = 'CURRENT',
    revision: string | null = chunk.sourceRevision,
  ) => ({ status, revision, evidence_refs: [], data });

  const packetKey = `packet:doc14:${chunk.chunkId}`;
  const packet = buildAcePacketV3({
    base: {
      packet_revision: 'doc14-valkey-proof-v1',
      producer_revision: 'doc14-outside-scan-cohort-v1',
      envelope: {
        packet_key: packetKey,
        source_ref: chunk.sourceRef,
        canonical_source_ref: chunk.sourceRef,
        feature_id: 'feature:doc14-outside-scan',
        source_revision: chunk.sourceRevision,
      },
      hypergraph: null,
    },
    identity: {
      packet_key: packetKey,
      source_ref: chunk.sourceRef,
      workspace_revision: 'workspace-doc14-proof-v1',
      source_revision: chunk.sourceRevision,
      packet_revision: 'doc14-valkey-proof-v1',
      producer_revision: 'doc14-outside-scan-cohort-v1',
      representation_id: 'semantic_768',
      representation_revision: 'embeddinggemma2:q8_0',
      feature_revision: 'feature-doc14-v1',
      graph_revision: 'graph-doc14-v1',
      symbol_version_id: null,
      tree_node_id: null,
    },
    source: section({
      language: 'typescript',
      source_digest: sha(chunk.contentSha256),
      start_byte: null,
      end_byte: null,
      ast_state: 'REVISION_QUALIFIED',
    }, 'CURRENT', chunk.sourceRevision),
    semantic: section({
      summary: section({ text: null, input_digest: null, model_revision: null }, 'PENDING', null),
      embedding: section({
        model: 'EmbeddingGemma',
        dimension: 768,
        input_digest: sha(chunk.chunkSha256),
        embedding_digest: sha(chunk.chunkSha256),
        vector_ref: { kind: 'CANDIDATE_ORDINAL', value: '0' },
      }, 'CURRENT', 'embeddinggemma2:q8_0'),
      keywords: [],
      entities: [],
      concept_ids: [],
      domain_class: null,
    }),
    topology: section({ community_id: null, pagerank: null, som: null, kmeans_cluster: null, centroid_refs: [] }, 'CURRENT', 'graph-doc14-v1'),
    residency: section({ tier: 'WARM', lod: 'IDENTITY', utility: null, prefetch_reasons: [], cache_identity_checksum: null }, 'PENDING', null),
    evidence: section({ refs: [], contradictions: [], stale_refs: [] }),
  });

  const cacheIdentity: AceBitfrostCacheIdentityV1 = {
    cacheKind: 'ACE_PACKET',
    artifactKind: 'ace_packet_v3',
    workspaceRevision: packet.identity.workspace_revision,
    sourceRevision: packet.identity.source_revision,
    packetRevision: packet.identity.packet_revision,
    representationId: packet.identity.representation_id,
    representationRevision: packet.identity.representation_revision!,
    candidateSnapshotRevision: 'doc14-admitted-chunks-v1',
    ordinalMapChecksum: `sha256:${chunk.chunkSha256}`,
    graphRevision: packet.identity.graph_revision!,
    featureRevision: packet.identity.feature_revision!,
    producerRevision: packet.identity.producer_revision,
    normalizationPolicyRevision: 'l2-renormalize-v1',
    artifactChecksum: packet.integrity.packet_checksum,
  };
  const expected = {
    packet_key: packet.identity.packet_key,
    source_ref: packet.identity.source_ref,
    workspace_revision: packet.identity.workspace_revision,
    source_revision: packet.identity.source_revision,
    producer_revision: packet.identity.producer_revision,
    representation_id: packet.identity.representation_id,
    representation_revision: packet.identity.representation_revision,
    feature_revision: packet.identity.feature_revision,
    graph_revision: packet.identity.graph_revision,
    packet_checksum: packet.integrity.packet_checksum,
  };
  const embedAllowedPacketKeys = new Set([packet.identity.packet_key]);
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  const writer = new AcePacketWriter();
  const reader = new AcePacketReader();

  try {
    const write = await writer.writeRevisionQualifiedV3ToBitfrost(redis, {
      packet,
      cacheIdentity,
      embedAllowedPacketKeys,
      ttlSeconds: 60,
    });
    if (write.status !== 'WRITTEN' || !write.cacheKey) {
      throw new Error(`VALKEY_WRITE_FAILED:${write.reason}`);
    }
    const ttlSeconds = await redis.ttl(write.cacheKey);
    const hit = await reader.readRevisionQualifiedV3FromBitfrost(redis, {
      cacheIdentity,
      expected,
      embedAllowedPacketKeys,
    });
    if (hit.status !== 'HIT' || hit.packet.integrity.packet_checksum !== packet.integrity.packet_checksum) {
      throw new Error(`VALKEY_READBACK_FAILED:${JSON.stringify(hit)}`);
    }
    const staleIdentity = { ...cacheIdentity, sourceRevision: 'sha256:' + '0'.repeat(64) };
    const staleRead = await reader.readRevisionQualifiedV3FromBitfrost(redis, {
      cacheIdentity: staleIdentity,
      expected: { ...expected, source_revision: staleIdentity.sourceRevision },
      embedAllowedPacketKeys,
    });
    await redis.del(write.cacheKey);

    const receipt = {
      schema: 'atlas.doc14-valkey-ace-readback.v1',
      generatedAt: new Date().toISOString(),
      chunkId: chunk.chunkId,
      sourceRef: chunk.sourceRef,
      sourceRevision: chunk.sourceRevision,
      cacheKey: write.cacheKey,
      writeStatus: write.status,
      ttlSecondsObserved: ttlSeconds,
      readbackStatus: hit.status,
      checksumMatched: hit.packet.integrity.packet_checksum === packet.integrity.packet_checksum,
      staleRevisionRejected: staleRead.status === 'MISS',
      cleanedUpTestKey: true,
      canonicalAuthority: false,
    };
    writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await redis.quit();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
