#!/usr/bin/env node
/**
 * score-superseded-originals.mjs
 *
 * Candidate-only scorer for cold originals.
 *
 * This lane is read-only:
 * - it does not move files
 * - it does not delete files
 * - it does not mutate Postgres / Qdrant / Redis / Neo4j / SeaweedFS
 *
 * It ranks archive candidates using existing repo evidence and emits
 * .tmp reports only.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const REPORTS = resolve(ROOT, 'docs', 'reports');
const TMP = resolve(ROOT, '.tmp');

const INPUTS = {
  moveList: resolve(REPORTS, 'sourceRef-parent-join-archive-move-list.json'),
  archivePlan: resolve(REPORTS, 'sourceRef-parent-join-archive-plan.json'),
  dirtyTree: resolve(REPORTS, 'repo-dirty-tree-classification-2026-06-01.json'),
  pathMap: resolve(TMP, 'path-map.json'),
  parentAtlas: resolve(ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json'),
  sourceRefInventory: resolve(REPORTS, 'sourceRef-atlas-join-inventory.json'),
  codebaseFeatureMap: resolve(REPORTS, 'codebase-feature-map.json'),
  kanbanBoard: resolve(ROOT, 'docs', 'graph', 'kanban-board.json'),
  preflight: resolve(ROOT, 'memory', 'agent-runs', 'current-corpus-promotion-preflight.json'),
};

const OUTPUTS = {
  candidatesJson: resolve(TMP, 'superseded-score-candidates.json'),
  candidatesMd: resolve(TMP, 'superseded-score-candidates.md'),
  candidatesNdjson: resolve(TMP, 'superseded-score-candidates.ndjson'),
  implementationJson: resolve(TMP, 'superseded-score-implementation-report.json'),
  implementationMd: resolve(TMP, 'superseded-score-implementation-report.md'),
};

const MAX_CHECKSUM_BYTES = 32 * 1024 * 1024;
const SCHEMA_VERSION = 'superseded.score.v1';

const CandidateSchema = z.object({
  original_path: z.string().min(1),
  sourceRef: z.string().min(1),
  cold_original_ref: z.string().min(1),
  candidate_class: z.enum(['source_file', 'generated_artifact', 'large_blob', 'submodule', 'mirror_surface']),
  superseded_score: z.number().int().min(0).max(100),
  bucket: z.enum([
    'keep_hot_in_repo',
    'packetization_incomplete',
    'warm_index_candidate',
    'archive_candidate_needs_cold_copy_or_review',
    'archive_eligible_after_human_review',
  ]),
  confidence: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  blockers: z.array(z.string()),
  recommended_action: z.object({
    kind: z.enum(['read_only', 'dry_run']),
    label: z.string().min(1),
    reason: z.string().min(1),
  }),
  delete_allowed: z.literal(false),
  move_allowed: z.literal(false),
  packet_coverage: z.number().min(0).max(1),
  sourceRef_coverage: z.number().min(0).max(1),
  feature_task_coverage: z.number().min(0).max(1),
  duplicate_detection_confidence: z.number().min(0).max(1),
  provenance_resolution: z.number().min(0).max(1),
  cold_copy_verified: z.literal(false),
  copied_to_cold_store: z.literal(false),
  checksum_verified: z.boolean(),
  recently_modified: z.boolean(),
  validated_packets: z.boolean(),
  checksum: z.string().nullable(),
  size_bytes: z.number().int().nullable(),
  size_gb: z.number().nullable(),
  path_bucket: z.string().nullable(),
  path_reason: z.string().nullable(),
}).strict();

const ReportSchema = z.object({
  generatedAt: z.string().min(1),
  repo: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  candidateOnly: z.literal(true),
  inputs: z.record(z.union([z.string(), z.boolean()])),
  summary: z.object({
    candidatesScored: z.number().int().nonnegative(),
    validatedPackets: z.number().int().nonnegative(),
    checksumVerified: z.number().int().nonnegative(),
    recentlyModified: z.number().int().nonnegative(),
    deleteAllowedTrue: z.number().int().nonnegative(),
    moveAllowedTrue: z.number().int().nonnegative(),
    archiveEligibleAfterHumanReview: z.number().int().nonnegative(),
    archiveCandidateNeedsColdCopyOrReview: z.number().int().nonnegative(),
    warmIndexCandidate: z.number().int().nonnegative(),
    packetizationIncomplete: z.number().int().nonnegative(),
    keepHotInRepo: z.number().int().nonnegative(),
    sourceFileCandidates: z.number().int().nonnegative(),
    generatedArtifactCandidates: z.number().int().nonnegative(),
    largeBlobCandidates: z.number().int().nonnegative(),
    submoduleCandidates: z.number().int().nonnegative(),
  }).strict(),
  scoringRules: z.object({
    formula: z.string().min(1),
    caps: z.array(z.string()),
    note: z.string().min(1),
  }).strict(),
  candidates: z.array(CandidateSchema),
  topCandidates: z.array(CandidateSchema),
  blockers: z.array(z.string()),
  recommendations: z.array(z.string()),
  outputs: z.object({
    candidatesJson: z.string().min(1),
    candidatesMd: z.string().min(1),
    candidatesNdjson: z.string().min(1),
    implementationJson: z.string().min(1),
    implementationMd: z.string().min(1),
  }).strict(),
  hardConstraints: z.object({
    deleteAllowed: z.literal(false),
    moveAllowed: z.literal(false),
    archiveFinal: z.literal(false),
  }).strict(),
}).strict();

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/g, '').trim();
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function sha256(input) {
  return createHash('sha256').update(String(input)).digest('hex');
}

function shortHash(input, len = 16) {
  return sha256(input).slice(0, len);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatGB(bytes) {
  if (bytes == null) return null;
  return Number((bytes / (1024 ** 3)).toFixed(3));
}

function safeStat(relPath) {
  try {
    return statSync(resolve(ROOT, relPath));
  } catch {
    return null;
  }
}

function fileExists(relPath) {
  return existsSync(resolve(ROOT, relPath));
}

function fileChecksum(relPath) {
  const stats = safeStat(relPath);
  if (!stats || stats.size > MAX_CHECKSUM_BYTES) return null;
  try {
    const buf = readFileSync(resolve(ROOT, relPath));
    return `sha256:${sha256(buf)}`;
  } catch {
    return null;
  }
}

function loadMoveList() {
  const report = readJson(INPUTS.moveList, null);
  if (!report?.destinations) return [];
  const rows = [];
  for (const [destination, entries] of Object.entries(report.destinations)) {
    for (const entry of entries ?? []) {
      rows.push({
        source: normalizePath(entry.source),
        bucket: String(entry.bucket ?? 'archive'),
        reason: String(entry.reason ?? ''),
        destination: normalizePath(destination),
        sourceReport: 'sourceRef-parent-join-archive-move-list',
      });
    }
  }
  return rows;
}

function loadArchivePlan() {
  const report = readJson(INPUTS.archivePlan, null);
  if (!report) return [];
  const rows = [];
  for (const pathValue of report.summarizeThenArchive ?? []) {
    rows.push({
      source: normalizePath(pathValue),
      bucket: 'summarizeThenArchive',
      reason: 'summarize then archive',
      destination: 'archive/generated-reports/',
      sourceReport: 'sourceRef-parent-join-archive-plan',
    });
  }
  for (const pathValue of report.externalizeOrRelocate ?? []) {
    rows.push({
      source: normalizePath(pathValue),
      bucket: 'externalizeOrRelocate',
      reason: 'externalize or relocate large blob',
      destination: 'archive/model-blobs/',
      sourceReport: 'sourceRef-parent-join-archive-plan',
    });
  }
  for (const pathValue of report.keepAsIndexSurface ?? []) {
    rows.push({
      source: normalizePath(pathValue),
      bucket: 'keepAsIndexSurface',
      reason: 'derived index surface',
      destination: 'archive/obsidian-vault-mirror/',
      sourceReport: 'sourceRef-parent-join-archive-plan',
    });
  }
  return rows;
}

function loadDirtyTree() {
  const report = readJson(INPUTS.dirtyTree, null);
  if (!report?.buckets) return [];
  const rows = [];
  for (const [bucket, bucketData] of Object.entries(report.buckets)) {
    for (const item of bucketData?.items ?? []) {
      rows.push({
        source: normalizePath(item.path ?? item.originalPath ?? ''),
        bucket,
        reason: String(item.reason ?? ''),
        destination: bucket === 'untrackedLargeBlobs'
          ? 'archive/model-blobs/'
          : bucket === 'submoduleDirtiness'
            ? 'archive/review-needed/'
            : bucket === 'sourceChanges'
              ? 'archive/review-needed/'
              : 'archive/generated-reports/',
        sourceReport: 'repo-dirty-tree-classification-2026-06-01',
      });
    }
  }
  return rows;
}

function collectArchiveCandidates() {
  const moveList = loadMoveList();
  const plan = loadArchivePlan();
  const dirty = loadDirtyTree();
  const combined = [...moveList, ...plan, ...dirty];
  const map = new Map();
  for (const item of combined) {
    if (!item.source) continue;
    const key = item.source;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function buildPathMapIndex() {
  const pathMap = readJson(INPUTS.pathMap, null);
  const rows = Object.values(pathMap ?? {});
  const byPath = new Map();
  for (const row of rows) {
    const filePath = normalizePath(row?.filePath ?? row?.path ?? '');
    if (!filePath) continue;
    byPath.set(filePath, row);
  }
  return { raw: pathMap, byPath };
}

function buildParentAtlasIndex() {
  const parentAtlas = readJson(INPUTS.parentAtlas, null);
  const entries = Array.isArray(parentAtlas?.entries) ? parentAtlas.entries : [];
  const byPath = new Map();
  for (const entry of entries) {
    const normalized = normalizePath(entry?.sourceRef ?? '');
    const pathKey = normalized.split('#')[0];
    if (!pathKey) continue;
    const arr = byPath.get(pathKey) ?? [];
    arr.push(entry);
    byPath.set(pathKey, arr);
  }
  return { raw: parentAtlas, entries, byPath };
}

function buildFeatureFileIndex() {
  const featureMap = readJson(INPUTS.codebaseFeatureMap, null);
  const byPath = new Map();
  for (const [featureId, feature] of Object.entries(featureMap?.features ?? {})) {
    for (const file of feature?.files ?? []) {
      const normalized = normalizePath(file);
      if (!normalized) continue;
      const set = byPath.get(normalized) ?? new Set();
      set.add(featureId);
      byPath.set(normalized, set);
    }
  }
  return { raw: featureMap, byPath };
}

function buildKanbanFileIndex() {
  const board = readJson(INPUTS.kanbanBoard, null);
  const byPath = new Map();
  for (const column of Object.values(board?.columns ?? {})) {
    for (const task of column?.tasks ?? []) {
      for (const file of task?.files ?? []) {
        const normalized = normalizePath(file);
        if (!normalized) continue;
        const set = byPath.get(normalized) ?? new Set();
        set.add(task?.featureId ?? task?.featureKey ?? task?.taskId ?? 'kanban');
        byPath.set(normalized, set);
      }
      for (const sourceRef of task?.sourceRefs ?? []) {
        const normalized = normalizePath(sourceRef).split('#')[0];
        if (!normalized) continue;
        const set = byPath.get(normalized) ?? new Set();
        set.add(task?.featureId ?? task?.featureKey ?? task?.taskId ?? 'kanban');
        byPath.set(normalized, set);
      }
    }
  }
  return { raw: board, byPath };
}

function buildPreflightSignals() {
  const preflight = readJson(INPUTS.preflight, null);
  return preflight ?? { promotionCandidates: {} };
}

function basenameCollisionCounts(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    const key = basename(candidate.source).toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function detectPreflightCoverage(pathValue, fileExists, sizeBytes) {
  const normalized = normalizePath(pathValue).toLowerCase();
  const hits = [];
  if (/(^|\/)(src|scripts|drizzle|docs\/architecture|docs\/atlas)(\/|$)/i.test(normalized)) hits.push('postgres_parent_atlas');
  if (/(neo4j|graph|kag|dag|topology)/i.test(normalized)) hits.push('neo4j_edges');
  if (/(cache|redis|bitfrost|bifrost|engram|packet|sourceref)/i.test(normalized)) hits.push('redis_hot_sourcerefs');
  if (/(^|\/)(src|scripts|drizzle|docs|memory)(\/|$)/i.test(normalized)) hits.push('qdrant_codebase_chunks');
  if ((fileExists && sizeBytes != null && sizeBytes >= 100 * 1024 * 1024) || /\.(gguf|onnx|sqlite|dump|tar|gz|zip|dll|so|lib)$/i.test(normalized)) {
    hits.push('seaweedfs_blobs');
  }
  return hits;
}

function classifyCandidateClass(candidate, originalPath) {
  const bucket = String(candidate.bucket ?? '').toLowerCase();
  const normalized = normalizePath(originalPath).toLowerCase();
  if (bucket === 'submoduledirtiness') return 'submodule';
  if (bucket === 'untrackedlargeblobs') return 'large_blob';
  if (
    bucket === 'intentionalgeneratedartifacts' ||
    /(docs\/reports|\.tmp\/|\.cache\/|\.opencode\/|obsidian-vault|generated|mirror|summary|packet|ndjson|jsonl)/i.test(normalized)
  ) {
    return 'generated_artifact';
  }
  if (
    bucket === 'sourcechanges' ||
    /(scripts\/|sveltekit-frontend\/src\/|sveltekit-frontend\/drizzle\/|docs\/architecture\/|docs\/atlas\/|docs\/graph\/|package\.json$|opencode\.json$)/i.test(normalized)
  ) {
    return 'source_file';
  }
  return 'mirror_surface';
}

function evaluateCandidate(candidate, context) {
  const originalPath = normalizePath(candidate.source);
  const sourceRef = originalPath;
  const coldOriginalRef = `cold://${originalPath}`;
  const candidateClass = classifyCandidateClass(candidate, originalPath);
  const pathExists = fileExists(originalPath);
  const stat = safeStat(originalPath);
  const sizeBytes = stat?.size ?? null;
  const sizeGB = formatGB(sizeBytes);
  const basenameKey = basename(originalPath).toLowerCase();
  const basenameCount = context.basenameCounts.get(basenameKey) ?? 1;
  const checksum = fileChecksum(originalPath);
  const checksumVerified = Boolean(checksum);
  const recentlyModified = Boolean(stat && (Date.now() - stat.mtimeMs) <= (30 * 24 * 60 * 60 * 1000));

  const parentEntries = context.parentAtlas.byPath.get(originalPath) ?? [];
  const packetCount = parentEntries.length;
  const packetCoverage = packetCount > 0 ? clamp(packetCount / 4, 0, 1) : 0;

  const pathMapRow = context.pathMap.byPath.get(originalPath) ?? null;
  const pathMapMatch = Boolean(pathMapRow);
  const pathMapFeature = String(pathMapRow?.feature ?? pathMapRow?.featureId ?? pathMapRow?.feature_id ?? '').trim();
  const featureMapMatch = context.featureMap.byPath.has(originalPath);
  const kanbanMatch = context.kanban.byPath.has(originalPath);
  const preflightHits = detectPreflightCoverage(originalPath, pathExists, sizeBytes);

  const sourceRefCoverage = clamp(
    (packetCount > 0 ? 0.55 : 0) +
    (pathMapMatch ? 0.25 : 0) +
    (featureMapMatch ? 0.10 : 0) +
    (kanbanMatch ? 0.10 : 0),
    0,
    1
  );

  const featureTaskCoverage = clamp(
    (featureMapMatch ? 0.55 : 0) +
    (kanbanMatch ? 0.35 : 0) +
    (preflightHits.length > 0 ? 0.10 : 0),
    0,
    1
  );

  const duplicateDetectionConfidence = clamp(
    ((basenameCount > 1 ? (basenameCount - 1) : 0) / 4) + (candidate.bucket === 'summarizeThenArchive' ? 0.10 : 0) + (candidate.bucket === 'externalizeOrRelocate' ? 0.10 : 0),
    0,
    1
  );

  const provenanceResolution = clamp(
    (packetCount > 0 ? 0.40 : 0) +
    (pathMapMatch ? 0.30 : 0) +
    (featureTaskCoverage > 0 ? 0.20 : 0) +
    (candidate.sourceReport === 'sourceRef-parent-join-archive-move-list' ? 0.10 : 0),
    0,
    1
  );

  const coldCopyVerified = false;
  const copiedToColdStore = false;
  const validatedPackets = candidateClass === 'generated_artifact'
    ? packetCount > 0
    : (packetCount > 0 || pathMapMatch || featureMapMatch || kanbanMatch);
  const hasUnresolvedRefs = sourceRefCoverage < 0.8 || !pathMapMatch || packetCount === 0;

  const reasons = [];
  const blockers = [];

  if (candidate.bucket) reasons.push(`bucket:${candidate.bucket}`);
  if (candidate.reason) reasons.push(candidate.reason);
  if (packetCount > 0) reasons.push(`packet_coverage:${packetCount}`);
  if (pathMapMatch) reasons.push('pathmap_match');
  if (featureMapMatch) reasons.push('feature_map_match');
  if (kanbanMatch) reasons.push('kanban_match');
  if (preflightHits.length > 0) reasons.push(`preflight:${preflightHits.join('|')}`);
  if (!checksumVerified) blockers.push('checksum_unverified');
  if (!validatedPackets) blockers.push('no_validated_packets');
  if (!copiedToColdStore) blockers.push('cold_copy_not_verified');
  if (sourceRefCoverage < 0.8) blockers.push('sourceRef_coverage_below_0.8');
  if (hasUnresolvedRefs) blockers.push('unresolved_refs');
  if (recentlyModified) blockers.push('recently_modified');

  let score = 0;
  if (validatedPackets) {
    score =
      (25 * packetCoverage) +
      (20 * sourceRefCoverage) +
      (15 * featureTaskCoverage) +
      (15 * duplicateDetectionConfidence) +
      (15 * provenanceResolution) +
      (10 * (coldCopyVerified ? 1 : 0));

    if (candidateClass === 'source_file') score += 8;
    if (candidateClass === 'generated_artifact') score -= 8;
    if (candidateClass === 'large_blob') score += 5;
    if (candidateClass === 'submodule') score -= 5;

    if (!checksumVerified) score = Math.min(score, 80);
    if (!copiedToColdStore) score = Math.min(score, 70);
    if (sourceRefCoverage < 0.8) score = Math.min(score, 60);
    if (hasUnresolvedRefs) score -= 15;
    if (recentlyModified) score -= 20;
  }

  score = clamp(Math.round(score), 0, 100);
  let bucket = 'keep_hot_in_repo';
  if (score >= 90) bucket = 'archive_eligible_after_human_review';
  else if (score >= 70) bucket = 'archive_candidate_needs_cold_copy_or_review';
  else if (score >= 50) bucket = 'warm_index_candidate';
  else if (score >= 25) bucket = 'packetization_incomplete';

  const confidence = clamp(Math.round(100 * (
    (0.45 * provenanceResolution) +
    (0.30 * sourceRefCoverage) +
    (0.25 * packetCoverage)
  )), 0, 100);

  const recommendedAction = bucket === 'keep_hot_in_repo'
    ? { kind: 'read_only', label: 'Keep hot in repo', reason: 'Packet coverage is insufficient for archive scoring' }
    : bucket === 'packetization_incomplete'
      ? { kind: 'dry_run', label: 'Finish packetization', reason: 'Candidate is identified, but packet coverage is still thin' }
      : bucket === 'warm_index_candidate'
        ? { kind: 'dry_run', label: 'Build warm index', reason: 'Candidate has some provenance, but cold-copy verification is not present' }
        : { kind: 'dry_run', label: 'Review before archive', reason: 'Candidate is scoreable, but this lane never authorizes delete or move' };

  return {
    original_path: originalPath,
    sourceRef,
    cold_original_ref: coldOriginalRef,
    candidate_class: candidateClass,
    superseded_score: score,
    bucket,
    confidence,
    reasons,
    blockers,
    recommended_action: recommendedAction,
    delete_allowed: false,
    move_allowed: false,
    packet_coverage: Number(packetCoverage.toFixed(3)),
    sourceRef_coverage: Number(sourceRefCoverage.toFixed(3)),
    feature_task_coverage: Number(featureTaskCoverage.toFixed(3)),
    duplicate_detection_confidence: Number(duplicateDetectionConfidence.toFixed(3)),
    provenance_resolution: Number(provenanceResolution.toFixed(3)),
    cold_copy_verified: false,
    copied_to_cold_store: false,
    checksum_verified: checksumVerified,
    recently_modified: recentlyModified,
    validated_packets: validatedPackets,
    checksum,
    size_bytes: sizeBytes,
    size_gb: sizeGB,
    path_bucket: candidate.bucket ?? null,
    path_reason: candidate.reason ?? null,
  };
}

function buildReport() {
  const candidatesRaw = collectArchiveCandidates();
  const basenameCounts = basenameCollisionCounts(candidatesRaw);
  const context = {
    pathMap: buildPathMapIndex(),
    parentAtlas: buildParentAtlasIndex(),
    featureMap: buildFeatureFileIndex(),
    kanban: buildKanbanFileIndex(),
    preflight: buildPreflightSignals(),
    basenameCounts,
  };

  const candidates = candidatesRaw
    .map((candidate) => evaluateCandidate(candidate, context))
    .map((candidate) => CandidateSchema.parse(candidate))
    .sort((a, b) => b.superseded_score - a.superseded_score || a.original_path.localeCompare(b.original_path));

  const buckets = candidates.reduce(
    (acc, candidate) => {
      acc[candidate.bucket] += 1;
      return acc;
    },
    {
      keep_hot_in_repo: 0,
      packetization_incomplete: 0,
      warm_index_candidate: 0,
      archive_candidate_needs_cold_copy_or_review: 0,
      archive_eligible_after_human_review: 0,
    }
  );

  const classBuckets = candidates.reduce(
    (acc, candidate) => {
      acc[candidate.candidate_class] += 1;
      return acc;
    },
    {
      source_file: 0,
      generated_artifact: 0,
      large_blob: 0,
      submodule: 0,
      mirror_surface: 0,
    }
  );

  const deleteAllowedTrue = candidates.filter((candidate) => candidate.delete_allowed === true).length;
  const moveAllowedTrue = candidates.filter((candidate) => candidate.move_allowed === true).length;
  const validatedPackets = candidates.filter((candidate) => candidate.validated_packets).length;
  const checksumVerified = candidates.filter((candidate) => candidate.checksum_verified).length;
  const recentlyModified = candidates.filter((candidate) => candidate.recently_modified).length;
  const blockers = [...new Set(candidates.flatMap((candidate) => candidate.blockers))].sort();

  const report = {
    generatedAt: new Date().toISOString(),
    repo: ROOT,
    schemaVersion: SCHEMA_VERSION,
    candidateOnly: true,
    inputs: {
      moveList: existsSync(INPUTS.moveList),
      archivePlan: existsSync(INPUTS.archivePlan),
      dirtyTree: existsSync(INPUTS.dirtyTree),
      pathMap: existsSync(INPUTS.pathMap),
      parentAtlas: existsSync(INPUTS.parentAtlas),
      sourceRefInventory: existsSync(INPUTS.sourceRefInventory),
      codebaseFeatureMap: existsSync(INPUTS.codebaseFeatureMap),
      kanbanBoard: existsSync(INPUTS.kanbanBoard),
      preflight: existsSync(INPUTS.preflight),
    },
    summary: {
      candidatesScored: candidates.length,
      validatedPackets,
      checksumVerified,
      recentlyModified,
      deleteAllowedTrue,
      moveAllowedTrue,
      archiveEligibleAfterHumanReview: buckets.archive_eligible_after_human_review,
      archiveCandidateNeedsColdCopyOrReview: buckets.archive_candidate_needs_cold_copy_or_review,
      warmIndexCandidate: buckets.warm_index_candidate,
      packetizationIncomplete: buckets.packetization_incomplete,
      keepHotInRepo: buckets.keep_hot_in_repo,
      sourceFileCandidates: classBuckets.source_file,
      generatedArtifactCandidates: classBuckets.generated_artifact,
      largeBlobCandidates: classBuckets.large_blob,
      submoduleCandidates: classBuckets.submodule,
    },
    scoringRules: {
      formula: '25*packet_coverage + 20*sourceRef_coverage + 15*feature_task_coverage + 15*duplicate_detection_confidence + 15*provenance_resolution + 10*(cold_copy_verified?1:0), then apply caps',
      caps: [
        'no validated packets => score 0',
        'checksum_verified false => max 80',
        'copied_to_cold_store false => max 70',
        'sourceRef_coverage < 0.8 => max 60',
        'unresolved refs => minus 15',
        'recently modified => minus 20',
      ],
      note: 'Candidate-only read-only scoring. delete_allowed and move_allowed are always false.',
    },
    candidates,
    topCandidates: candidates.slice(0, 75),
    blockers,
    recommendations: [
      'Use this report as a prioritization lens only.',
      'Do not delete or move any file from this output.',
      'Archive eligibility still requires cold-copy verification, checksum confirmation, and explicit human review.',
    ],
    outputs: {
      candidatesJson: OUTPUTS.candidatesJson,
      candidatesMd: OUTPUTS.candidatesMd,
      candidatesNdjson: OUTPUTS.candidatesNdjson,
      implementationJson: OUTPUTS.implementationJson,
      implementationMd: OUTPUTS.implementationMd,
    },
    hardConstraints: {
      deleteAllowed: false,
      moveAllowed: false,
      archiveFinal: false,
    },
  };

  const validatedReport = ReportSchema.parse(report);
  return validatedReport;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Superseded Score Candidates');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Repo: ${report.repo}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Candidates scored: ${report.summary.candidatesScored}`);
  lines.push(`- Validated packets: ${report.summary.validatedPackets}`);
  lines.push(`- Checksum verified: ${report.summary.checksumVerified}`);
  lines.push(`- Recently modified: ${report.summary.recentlyModified}`);
  lines.push(`- Delete allowed true: ${report.summary.deleteAllowedTrue}`);
  lines.push(`- Move allowed true: ${report.summary.moveAllowedTrue}`);
  lines.push(`- Archive eligible after human review: ${report.summary.archiveEligibleAfterHumanReview}`);
  lines.push(`- Archive candidate needs cold copy or review: ${report.summary.archiveCandidateNeedsColdCopyOrReview}`);
  lines.push(`- Warm index candidate: ${report.summary.warmIndexCandidate}`);
  lines.push(`- Packetization incomplete: ${report.summary.packetizationIncomplete}`);
  lines.push(`- Keep hot in repo: ${report.summary.keepHotInRepo}`);
  lines.push(`- Source file candidates: ${report.summary.sourceFileCandidates}`);
  lines.push(`- Generated artifact candidates: ${report.summary.generatedArtifactCandidates}`);
  lines.push(`- Large blob candidates: ${report.summary.largeBlobCandidates}`);
  lines.push(`- Submodule candidates: ${report.summary.submoduleCandidates}`);
  lines.push('');
  lines.push('## Constraints');
  lines.push('');
  lines.push('- delete_allowed is always false');
  lines.push('- move_allowed is always false');
  lines.push('- archive-final is not permitted in this report');
  lines.push('');
  lines.push('## Top Candidates');
  lines.push('');
  lines.push('| Score | Bucket | Confidence | Path | SourceRef | Reasons | Blockers |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const candidate of report.topCandidates) {
    lines.push(`| ${candidate.superseded_score} | ${candidate.bucket} | ${candidate.confidence} | ${candidate.original_path} | ${candidate.sourceRef} | ${candidate.reasons.join('; ')} | ${candidate.blockers.join('; ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Top Source File Candidates');
  lines.push('');
  lines.push('| Score | Confidence | Path | SourceRef | Reasons | Blockers |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const candidate of report.candidates.filter((row) => row.candidate_class === 'source_file').slice(0, 25)) {
    lines.push(`| ${candidate.superseded_score} | ${candidate.confidence} | ${candidate.original_path} | ${candidate.sourceRef} | ${candidate.reasons.join('; ')} | ${candidate.blockers.join('; ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Top Generated Artifact Candidates');
  lines.push('');
  lines.push('| Score | Confidence | Path | SourceRef | Reasons | Blockers |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const candidate of report.candidates.filter((row) => row.candidate_class === 'generated_artifact').slice(0, 25)) {
    lines.push(`| ${candidate.superseded_score} | ${candidate.confidence} | ${candidate.original_path} | ${candidate.sourceRef} | ${candidate.reasons.join('; ')} | ${candidate.blockers.join('; ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Scoring Rules');
  lines.push('');
  lines.push(`- Formula: ${report.scoringRules.formula}`);
  for (const cap of report.scoringRules.caps) lines.push(`- ${cap}`);
  lines.push(`- ${report.scoringRules.note}`);
  lines.push('');
  return lines.join('\n') + '\n';
}

function renderImplementationMarkdown(report) {
  const lines = [];
  lines.push('# Superseded Score Implementation Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Repo: ${report.repo}`);
  lines.push('');
  lines.push('## Outputs');
  lines.push('');
  lines.push(`- JSON: \`${OUTPUTS.candidatesJson}\``);
  lines.push(`- Markdown: \`${OUTPUTS.candidatesMd}\``);
  lines.push(`- NDJSON: \`${OUTPUTS.candidatesNdjson}\``);
  lines.push(`- Implementation JSON: \`${OUTPUTS.implementationJson}\``);
  lines.push(`- Implementation Markdown: \`${OUTPUTS.implementationMd}\``);
  lines.push('');
  lines.push('## Hard Constraints');
  lines.push('');
  lines.push('- delete_allowed = false');
  lines.push('- move_allowed = false');
  lines.push('- archive_final = false');
  lines.push('');
  lines.push('## Validation');
  lines.push('');
  lines.push(`- Candidates scored: ${report.summary.candidatesScored}`);
  lines.push(`- Validated packets: ${report.summary.validatedPackets}`);
  lines.push(`- Checksum verified: ${report.summary.checksumVerified}`);
  lines.push(`- Recently modified: ${report.summary.recentlyModified}`);
  lines.push(`- delete_allowed true rows: ${report.summary.deleteAllowedTrue}`);
  lines.push(`- move_allowed true rows: ${report.summary.moveAllowedTrue}`);
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  for (const item of report.recommendations) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Next Safe Command');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/promotion/report-promotion-status.mjs');
  lines.push('```');
  lines.push('');
  return lines.join('\n') + '\n';
}

function writeOutputs(report) {
  ensureDir(OUTPUTS.candidatesJson);
  const ndjson = report.candidates.map((candidate) => JSON.stringify(candidate)).join('\n') + '\n';
  writeFileSync(OUTPUTS.candidatesJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
  writeFileSync(OUTPUTS.candidatesMd, renderMarkdown(report), 'utf8');
  writeFileSync(OUTPUTS.candidatesNdjson, ndjson, 'utf8');

  const implementationReport = {
    generatedAt: report.generatedAt,
    repo: report.repo,
    schemaVersion: report.schemaVersion,
    candidateOnly: true,
    dryRun: true,
    outputs: report.outputs,
    summary: report.summary,
    blockers: report.blockers,
    hardConstraints: report.hardConstraints,
    deleteAllowedAny: report.summary.deleteAllowedTrue > 0,
    moveAllowedAny: report.summary.moveAllowedTrue > 0,
    docsUpdated: [
      'docs/architecture/cold-warm-hot-packet-lifecycle.md',
      'MASTER-FEATURE-TODO-2026-05-20.md',
      'IMPLEMENTATION_STATUS.md',
    ],
    nextSafeCommand: 'node scripts/promotion/report-promotion-status.mjs',
    note: 'Candidate-only report generation; no delete/move/archive-final actions were attempted.',
  };
  writeFileSync(OUTPUTS.implementationJson, JSON.stringify(implementationReport, null, 2) + '\n', 'utf8');
  writeFileSync(OUTPUTS.implementationMd, renderImplementationMarkdown(report), 'utf8');
  return implementationReport;
}

function main() {
  const report = buildReport();
  const implementationReport = writeOutputs(report);
  const summary = {
    generatedAt: report.generatedAt,
    candidateOnly: true,
    summary: report.summary,
    topCandidate: report.topCandidates[0] ?? null,
    outputs: report.outputs,
    hardConstraints: report.hardConstraints,
  };
  console.log(JSON.stringify(summary, null, 2));
  return implementationReport;
}

main();
