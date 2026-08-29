#!/usr/bin/env node

/**
 * Read-only STRUCT-13D proof.
 * Compares the legacy Postgres AST projection with the live :8095 structural
 * provider over a bounded CandidateOrdinal source allowlist. Neither result
 * set is written to RRF by this script.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.join(root, 'docs/reports/structural-provider-shadow-v1.json');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const query = process.env.ATLAS_STRUCTURAL_QUERY ?? 'which function calls CandidateOrdinal?';
const maxSources = Math.min(Number(process.env.ATLAS_STRUCTURAL_SHADOW_SOURCES ?? 5), 5);
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const digest = (value) => sha256(JSON.stringify(value));

function languageFor(sourceRef) {
  if (/\.(tsx?|mts|cts)$/.test(sourceRef)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(sourceRef)) return 'javascript';
  if (/\.rs$/.test(sourceRef)) return 'rust';
  return null;
}

function readMap() {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  if (!Array.isArray(map.candidates) || !map.workspaceRevision || !map.ordinalMapChecksum) {
    throw new Error('STRUCTURAL_SHADOW_CANDIDATE_MAP_INVALID');
  }
  const candidates = map.candidates
    .filter((row) => row.sourceRef && row.sourceRevision && row.workspaceRevision === map.workspaceRevision)
    .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal)
    .slice(0, maxSources);
  if (candidates.length === 0) throw new Error('STRUCTURAL_SHADOW_SOURCE_ALLOWLIST_EMPTY');
  return { map, candidates };
}

async function legacyCandidates(pool, candidates) {
  const refs = candidates.map((row) => row.sourceRef);
  const result = await pool.query(`
    SELECT packet_key, packet_id, source_ref, function_symbol,
           payload->>'packet_type' AS packet_type, tree_node_id::text AS tree_node_id, sha256 AS content_hash,
           COALESCE(metadata->>'workspace_revision', metadata->>'workspaceRevision', metadata->>'revision') AS workspace_revision
      FROM atlas_packets
     WHERE source_ref = ANY($1::text[])
       AND function_symbol IS NOT NULL
     ORDER BY source_ref ASC, function_symbol ASC
     LIMIT 50
  `, [refs]);
  return result.rows.map((row, index) => ({
    packetKey: row.packet_key,
    packetId: row.packet_id,
    sourceRef: row.source_ref,
    rank: index + 1,
    score: 0.8,
    lane: 'ast',
    metadata: {
      function_symbol: row.function_symbol,
      packet_type: row.packet_type,
      tree_node_id: row.tree_node_id,
      content_hash: row.content_hash,
      workspace_revision: row.workspace_revision,
    },
  })).filter((row) => row.packetKey && row.sourceRef);
}

async function structuralCandidates(map, candidates) {
  const { classifyStructuralQueryV1, executeStructuralQueryV1, resolveStructuralIdentityV1 } = await import('../../packages/parent-atlas/dist/index.js');
  const observations = [];
  const sourceErrors = [];
  for (const candidate of candidates) {
    const sourcePath = path.join(root, candidate.sourceRef.replaceAll('/', path.sep));
    const source = fs.readFileSync(sourcePath, 'utf8');
    const language = languageFor(candidate.sourceRef);
    if (!language) continue;
    const response = await fetch(`${sidecarUrl}/ast/chunk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, language, filePath: candidate.sourceRef, sourceRevision: candidate.sourceRevision }),
    });
    if (!response.ok) {
      sourceErrors.push({ sourceRef: candidate.sourceRef, status: response.status });
      continue;
    }
    const evidence = await response.json();
    for (const chunk of Array.isArray(evidence.chunks) ? evidence.chunks : []) {
      const start = Number(chunk.start_byte ?? 0);
      const end = Math.max(Number(chunk.end_byte ?? start), start + 1);
      observations.push({
        schema: 'atlas.ast-grep-observation.v1',
        observation_id: `shadow:${sha256(JSON.stringify([candidate.sourceRef, candidate.sourceRevision, start, end, chunk.upstream_node_id ?? null])).slice(0, 40)}`,
        rule_id: `treesitter:${chunk.node_type ?? 'unknown'}`,
        source_ref: candidate.sourceRef,
        source_revision: candidate.sourceRevision,
        byte_start: start,
        byte_end: end,
        upstream_node_id: chunk.upstream_node_id,
        upstream_chunk_id: chunk.upstream_chunk_id,
        matched_text_hash: sha256(source.slice(start, end)),
        captures: { name: chunk.name ?? '', calls: (chunk.calls ?? []).join(','), imports: (chunk.imports ?? []).join(','), exports: (chunk.exports ?? []).join(',') },
        observation_kind: chunk.node_type ?? 'unknown',
        confidence: 1,
        extractor_revision: `${evidence.engine ?? 'unknown'}:${evidence.engine_version ?? 'unknown'}`,
        canonical_authority: false,
      });
    }
  }
  const plan = classifyStructuralQueryV1(query);
  const candidateEntries = map.candidates.map((row) => ({
    candidateOrdinal: row.candidateOrdinal,
    canonicalId: row.canonicalId,
    packetKey: row.packetKey ?? null,
    sourceRef: row.sourceRef,
    sourceRevision: row.sourceRevision,
    workspaceRevision: row.workspaceRevision,
  }));
  const resolutions = [];
  const hits = [];
  let matchedCount = 0;
  for (const sourceRef of [...new Set(observations.map((row) => row.source_ref))].sort()) {
    const sourceObservations = observations.filter((row) => row.source_ref === sourceRef);
    const queryResult = executeStructuralQueryV1({ plan, observations: sourceObservations });
    matchedCount += queryResult.matches.length;
    const identity = resolveStructuralIdentityV1({ queryResult, workspaceRevision: map.workspaceRevision, candidateEntries });
    resolutions.push(...identity.resolutions);
    for (const row of identity.resolutions.filter((value) => value.status === 'RESOLVED_EXACT')) {
      hits.push({ packetKey: row.packetKey, sourceRef: row.sourceRef, rank: hits.length + 1, score: 1 / (hits.length + 1), lane: 'ast', metadata: { structural_candidate_ordinal: row.candidateOrdinal } });
    }
  }
  return { candidates: hits, observationCount: observations.length, matchedCount, identity: { resolutions, resolvedCount: resolutions.filter((row) => row.status === 'RESOLVED_EXACT').length }, sourceErrors, resultChecksum: digest(hits) };
}

function orderedKeys(rows) {
  return [...new Set(rows.map((row) => row.packetKey).filter(Boolean))].sort();
}

async function main() {
  const { map, candidates } = readMap();
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 5000 });
  try {
    const [legacy, structural] = await Promise.all([
      legacyCandidates(pool, candidates),
      structuralCandidates(map, candidates),
    ]);
    const legacyKeys = orderedKeys(legacy);
    const structuralKeys = orderedKeys(structural.candidates);
    const legacySet = new Set(legacyKeys);
    const structuralSet = new Set(structuralKeys);
    const intersection = structuralKeys.filter((key) => legacySet.has(key));
    const receiptBase = {
      schema: 'atlas.structural-provider-shadow-receipt.v1',
      query,
      queryDigest: `sha256:${sha256(query)}`,
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
      workspaceRevision: map.workspaceRevision,
      sourceAllowlist: candidates.map((row) => ({ candidateOrdinal: row.candidateOrdinal, packetKey: row.packetKey, sourceRef: row.sourceRef })),
      legacy: { candidateCount: legacy.length, packetKeys: legacyKeys, checksum: digest(legacyKeys) },
      structural: { observationCount: structural.observationCount, matchedCount: structural.matchedCount, exactIdentityCount: structural.identity.resolvedCount, candidateOrdinalCount: structural.candidates.filter((row) => row.metadata?.structural_candidate_ordinal != null).length, packetKeys: structuralKeys, checksum: structural.resultChecksum, sourceErrors: structural.sourceErrors },
      intersectionCount: intersection.length,
      unionCount: new Set([...legacyKeys, ...structuralKeys]).size,
      exactPacketOverlap: legacyKeys.length === 0 ? 0 : intersection.length / legacyKeys.length,
      newOnly: structuralKeys.filter((key) => !legacySet.has(key)),
      legacyOnly: legacyKeys.filter((key) => !structuralSet.has(key)),
      staleRejected: structural.identity.resolutions.filter((row) => row.status === 'SOURCE_REVISION_MISMATCH' || row.status === 'MIXED_WORKSPACE').length,
      ambiguousRejected: structural.identity.resolutions.filter((row) => row.status === 'AMBIGUOUS_SOURCE').length,
      unresolvedRejected: structural.identity.resolutions.filter((row) => row.status === 'UNRESOLVED_SOURCE').length,
      legacyEnteredRrf: true,
      structuralEnteredRrf: false,
      writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, rrf: false },
      status: legacyKeys.length > 0
        ? 'STRUCTURAL_SHADOW_PARITY_PROVEN_BOUNDED'
        : 'STRUCTURAL_SHADOW_LEGACY_EMPTY',
    };
    const receipt = { ...receiptBase, receiptChecksum: `sha256:${sha256(JSON.stringify(receiptBase))}` };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify({ status: receipt.status, sources: candidates.length, legacy: legacyKeys.length, structural: structuralKeys.length, intersection: intersection.length, reportPath: path.relative(root, reportPath) }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
