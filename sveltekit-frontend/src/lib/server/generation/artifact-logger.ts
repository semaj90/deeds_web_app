/**
 * PHASE 85a: ARTIFACT REGISTRY LOGGER
 *
 * Universal derived registry: every generated artifact (summary, embedding, latent64,
 * feature labels, GAN report, trace, etc.) gets one entry with immutable identity
 * and generator tracking.
 *
 * Canonical packet identity: packet_key + source_ref + feature_id (immutable)
 */

import { createHash } from 'crypto';
import { db } from '$lib/server/db/client.js';
import { atlas_artifacts } from '$lib/server/db/schema-postgres.js';
import { eq, and, desc, asc } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ArtifactType =
  | 'summary'
  | 'embedding'
  | 'latent64'
  | 'som_cell'
  | 'redis_cache'
  | 'markdown'
  | 'qdrant_payload'
  | 'gemma4_prompt'
  | 'gemma4_output'
  | 'feature_labels'
  | 'gan_report'
  | 'benchmark'
  | 'trace';

export type Generator =
  | 'Gemma4'
  | 'EmbeddingGemma'
  | 'AutoEncoder'
  | 'SOM'
  | 'KarpathyBlender'
  | 'GANValidator'
  | 'LangExtract'
  | 'MarkdownGenerator'
  | 'TraceExporter';

export type ArtifactStatus = 'generated' | 'validated' | 'superseded' | 'failed';

export interface ArtifactLogEntry {
  packet_key: string;
  source_ref: string;
  feature_id?: string;
  artifact_type: ArtifactType;
  generator: Generator;
  generator_version: string;
  generator_config?: Record<string, unknown>;
  storage_backend: 'filesystem' | 'qdrant' | 'redis' | 'postgres_jsonb' | 'seaweedfs';
  storage_location?: string;
  status?: ArtifactStatus;
  gan_validated?: Date;
  gan_validation_score?: number;
  trace_id?: string;
  git_commit?: string;
  content?: string | Buffer;
}

// ── Hash content for dedup ─────────────────────────────────────────────────────

function hashContent(content: string | Buffer | undefined): string | null {
  if (!content) return null;
  const buf = typeof content === 'string' ? Buffer.from(content) : content;
  return createHash('sha256').update(buf).digest('hex');
}

// ── Log artifact to registry ───────────────────────────────────────────────────

export async function logArtifact(entry: ArtifactLogEntry): Promise<string> {
  const contentHash = hashContent(entry.content);

  // Check if this exact artifact already exists (by content hash)
  if (contentHash) {
    const existing = await db
      .select({ artifact_id: atlas_artifacts.artifact_id })
      .from(atlas_artifacts)
      .where(
        and(
          eq(atlas_artifacts.packet_key, entry.packet_key),
          eq(atlas_artifacts.artifact_type, entry.artifact_type),
          eq(atlas_artifacts.content_hash, contentHash)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0].artifact_id;
    }
  }

  // Find previous artifact (if regenerating)
  let previousArtifactId: string | null = null;
  if (entry.storage_backend === 'qdrant' || entry.storage_backend === 'redis') {
    const prev = await db
      .select({ artifact_id: atlas_artifacts.artifact_id })
      .from(atlas_artifacts)
      .where(
        and(
          eq(atlas_artifacts.packet_key, entry.packet_key),
          eq(atlas_artifacts.artifact_type, entry.artifact_type)
        )
      )
      .orderBy(desc(atlas_artifacts.created_at))
      .limit(1);

    if (prev.length > 0) {
      previousArtifactId = prev[0].artifact_id;
    }
  }

  // Mark previous artifact as superseded
  if (previousArtifactId) {
    await db
      .update(atlas_artifacts)
      .set({ status: 'superseded' })
      .where(eq(atlas_artifacts.artifact_id, previousArtifactId));
  }

  // Insert new artifact
  const [inserted] = await db
    .insert(atlas_artifacts)
    .values({
      packet_key: entry.packet_key,
      source_ref: entry.source_ref,
      feature_id: entry.feature_id || null,
      artifact_type: entry.artifact_type,
      content_hash: contentHash,
      generator: entry.generator,
      generator_version: entry.generator_version,
      generator_config: entry.generator_config ? JSON.stringify(entry.generator_config) : null,
      storage_backend: entry.storage_backend,
      storage_location: entry.storage_location || null,
      gan_validated: entry.gan_validated || null,
      gan_validation_score: entry.gan_validation_score || null,
      supersedes_artifact_id: previousArtifactId || null,
      status: entry.status || 'generated',
      trace_id: entry.trace_id || null,
      git_commit: entry.git_commit || null,
    })
      .returning({ artifact_id: atlas_artifacts.artifact_id });

  return inserted.artifact_id;
}

// ── Query artifacts by packet ──────────────────────────────────────────────────

export async function getPacketArtifacts(
  packetKey: string,
  artifactType?: ArtifactType
) {
  if (artifactType) {
    return db
      .select()
      .from(atlas_artifacts)
      .where(and(eq(atlas_artifacts.packet_key, packetKey), eq(atlas_artifacts.artifact_type, artifactType)));
  }

  return db.select().from(atlas_artifacts).where(eq(atlas_artifacts.packet_key, packetKey));
}

// ── Query artifacts by generator and version ───────────────────────────────────

export async function getArtifactsByGenerator(generator: Generator, version?: string) {
  if (version) {
    return db
      .select()
      .from(atlas_artifacts)
      .where(and(eq(atlas_artifacts.generator, generator), eq(atlas_artifacts.generator_version, version)));
  }

  return db.select().from(atlas_artifacts).where(eq(atlas_artifacts.generator, generator));
}

// ── Track supersedes chain ─────────────────────────────────────────────────────

export async function getSupersessionChain(packetKey: string, artifactType: ArtifactType) {
  let chain = [];
  let current = await db
    .select()
    .from(atlas_artifacts)
    .where(and(eq(atlas_artifacts.packet_key, packetKey), eq(atlas_artifacts.artifact_type, artifactType)))
    .orderBy(asc(atlas_artifacts.created_at))
    .limit(1);

  while (current.length > 0) {
    chain.push(current[0]);

    if (current[0].supersedes_artifact_id) {
      current = await db
        .select()
        .from(atlas_artifacts)
        .where(eq(atlas_artifacts.artifact_id, current[0].supersedes_artifact_id));
    } else {
      break;
    }
  }

  return chain;
}

// ── Mark artifact as validated ─────────────────────────────────────────────────

export async function markArtifactValidated(
  artifactId: string,
  ganScore: number,
  timestamp: Date = new Date()
) {
  return db
    .update(atlas_artifacts)
    .set({
      status: 'validated',
      gan_validated: timestamp,
      gan_validation_score: ganScore,
    })
    .where(eq(atlas_artifacts.artifact_id, artifactId));
}

// ── Mark artifact as failed ────────────────────────────────────────────────────

export async function markArtifactFailed(artifactId: string) {
  return db
    .update(atlas_artifacts)
    .set({ status: 'failed' })
    .where(eq(atlas_artifacts.artifact_id, artifactId));
}
