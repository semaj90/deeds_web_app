#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import { readJson, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown } from './_atlas-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolveRepoPath('.');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

const MANIFEST_PATH = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas.json');
const REPORT_JSON = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas-qdrant.json');
const REPORT_MD = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas-qdrant.md');
const COLLECTION = process.env.PARENT_ATLAS_COMMAND_COLLECTION ?? 'parent_atlas_feature_commands_768';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const OLLAMA_URL = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

const argv = new Set(process.argv.slice(2));
const WRITE = argv.has('--write') || argv.has('--apply');
const DRY_RUN = argv.has('--dry-run') || !WRITE;

function sha256ToUuid(key) {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

function laneText(lane) {
  const lines = [
    `lane: ${lane.title}`,
    `lane_id: ${lane.laneId}`,
    `description: ${lane.description}`,
    `match_count: ${lane.matchCount ?? 0}`,
    `source_ref_anchors: ${lane.sourceRefAnchors ?? 0}`,
    `semantic_hash: ${lane.semanticHash ?? ''}`,
    `feature_keys: ${(lane.topFeatureKeys ?? []).join(', ')}`,
    `todo_anchors: ${(lane.todoAnchors ?? []).join(' | ')}`,
    'top_matches:',
  ];
  for (const match of lane.topMatches ?? []) {
    lines.push(
      `- ${match.featureKey ?? match.title ?? 'unknown'} :: ${match.title ?? ''} :: ${match.status ?? ''} :: ${match.nextQuery ?? ''}`
    );
    if (Array.isArray(match.sourceRefs) && match.sourceRefs.length) {
      lines.push(`  sourceRefs: ${match.sourceRefs.join(', ')}`);
    }
  }
  return lines.join('\n');
}

function fallbackVector(text, dimension = 768) {
  const seed = crypto.createHash('sha1').update(text).digest();
  const vector = new Array(dimension).fill(0).map((_, index) => {
    const byte = seed[index % seed.length];
    return (byte - 128) / 128;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  try {
    const res = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`embed failed ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.embeddings) && data.embeddings.length === texts.length) {
      return data.embeddings;
    }
    if (Array.isArray(data?.embedding) && texts.length === 1) {
      return [data.embedding];
    }
  } catch {
    // fall through to deterministic fallback
  }

  return texts.map((text) => fallbackVector(text));
}

function ensureCollection(client) {
  return client.createCollection(COLLECTION, {
    vectors: {
      content: { size: 768, distance: 'Cosine' },
    },
    hnsw_config: {
      m: 16,
      ef_construct: 128,
      full_scan_threshold: 10_000,
      max_indexing_threads: 2,
      on_disk: false,
    },
  }).catch(async (error) => {
    const msg = String(error?.message ?? error);
    if (!msg.includes('already exists') && !msg.includes('Conflict')) {
      throw error;
    }
  });
}

function buildPoints(manifest, vectors) {
  return manifest.lanes.map((lane, index) => {
    const sourceRefs = [...new Set((lane.topMatches ?? []).flatMap((entry) => entry.sourceRefs ?? []))];
    return {
      id: sha256ToUuid(`parent_atlas:${lane.laneId}`),
      vector: { content: vectors[index] ?? new Array(768).fill(0) },
      payload: {
        point_kind: 'feature_summary',
        workspace_id: 'parent_atlas',
        workspace_task_id: `parent_atlas:${lane.laneId}`,
        feature_id: lane.topMatches?.[0]?.featureKey ?? lane.laneId,
        source_ref: sourceRefs[0] ?? null,
        sourceRefs,
        semantic_path: ['parent_atlas', lane.laneId, 'feature_command_atlas'],
        related_feature_ids: (lane.topMatches ?? []).slice(0, 8).map((entry) => entry.featureKey ?? entry.title).filter(Boolean),
        related_task_ids: (lane.todoAnchors ?? []).slice(0, 8).map((_, i) => `todo:${lane.laneId}:${i}`),
        related_file_paths: sourceRefs.map((ref) => ref.split('#')[0]).slice(0, 16),
        cluster_id: lane.laneId,
        centroid_id: `centroid:${lane.laneId}`,
        parent_centroid_id: 'parent_atlas:feature_command_atlas',
        summary_llm: lane.description,
        summary_model: 'gemma4',
        summary_hash: lane.semanticHash,
        confidence: Math.max(0.5, Math.min(0.99, (lane.matchCount ?? 0) / 1000 + 0.5)),
        status: 'todo',
        agent_pickup_ready: true,
        observed_at: manifest.generatedAt,
        updated_at: new Date().toISOString(),
        valid_from: manifest.generatedAt,
        valid_to: null,
        deleted: false,
        lane_id: lane.laneId,
        lane_title: lane.title,
        lane_description: lane.description,
        lane_match_count: lane.matchCount ?? 0,
        lane_semantic_hash: lane.semanticHash,
        lane_source_ref_anchors: lane.sourceRefAnchors ?? 0,
        lane_top_feature_keys: lane.topFeatureKeys ?? [],
        lane_todo_anchors: lane.todoAnchors ?? [],
        source_refs: sourceRefs,
      },
    };
  });
}

function renderMarkdown(report) {
  return parentAtlasMarkdown('Parent Atlas Feature Command Atlas Qdrant Projection', {
    lanes: report.summary.lanesProjected,
    points: report.summary.pointsPrepared,
    applied: report.summary.applied,
    collection: report.summary.collection,
  }, report.lanes.map((lane) => `${lane.laneId}: pointId=${lane.pointId}, status=${lane.pointStatus}, sourceRefs=${lane.sourceRefsCount}`));
}

async function main() {
  const manifest = readJson(MANIFEST_PATH, null);
  if (!manifest?.lanes?.length) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}. Run npm run atlas:feature-command-atlas first.`);
  }

  const texts = manifest.lanes.map(laneText);
  const vectors = await embedBatch(texts);
  const client = new QdrantClient({ url: QDRANT_URL });

  if (!DRY_RUN) {
    await ensureCollection(client);
  }
  const points = buildPoints(manifest, vectors);

  let applied = false;
  if (!DRY_RUN) {
    await client.upsert(COLLECTION, {
      wait: true,
      points,
    });
    applied = true;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      manifestPath: MANIFEST_PATH,
      collection: COLLECTION,
      qdrantUrl: QDRANT_URL,
    },
    summary: {
      lanesProjected: manifest.lanes.length,
      pointsPrepared: points.length,
      applied,
      collection: COLLECTION,
      vectorSource: vectors.every((vector) => Array.isArray(vector) && vector.length === 768) ? 'ollama-or-fallback' : 'fallback',
      model: EMBED_MODEL,
    },
    lanes: points.map((point, index) => ({
      laneId: manifest.lanes[index].laneId,
      pointId: point.id,
      pointStatus: applied ? 'written' : 'prepared',
      sourceRefsCount: point.payload.sourceRefs.length,
      featureId: point.payload.feature_id,
      clusterId: point.payload.cluster_id,
    })),
  };

  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, renderMarkdown(report));

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Qdrant collection: ${COLLECTION}`);
  console.log(`Applied: ${applied ? 'yes' : 'no'}`);
}

main().catch((error) => {
  console.error('Parent Atlas Qdrant projection failed:', error?.message ?? error);
  process.exit(1);
});
