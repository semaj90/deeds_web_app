#!/usr/bin/env node
/** Read-only classification of packet source refs against the current Graphify workspace. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { normalizeSourceRef } from './lib/canonical-source-ref.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/graphify-packet-source-coverage-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const basenameOf = (value) => value.split('/').filter(Boolean).at(-1) ?? value;
const historicalPattern = /(^|\/)(?:\d{1,2}[_-])|\.txt$/i;
const nonCanonicalPrefix = /^(?:claude-mem|models|granite-docling|llama-cpp-turboquant-gemma4|data\/external-docs)(?:\/|$)/i;
const loadObservationBindings = () => {
  try {
    const value = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json'), 'utf8'));
    return new Map((value.bindings ?? []).map((binding) => [String(binding.sourceRef), binding]));
  } catch { return new Map(); }
};

async function main() {
  const [packets, graphify] = await Promise.all([
    pool.query(`SELECT source_ref, count(*)::integer AS packet_count
                FROM public.atlas_packets
                WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
                GROUP BY source_ref ORDER BY source_ref`),
    pool.query(`SELECT source_ref FROM public.graphify_files
                WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
                GROUP BY source_ref ORDER BY source_ref`),
  ]);
  const observationBindings = loadObservationBindings();
  const observationRefs = new Set(observationBindings.keys());
  const graphifyRefs = graphify.rows.map((row) => String(row.source_ref));
  const graphifyRaw = new Set(graphifyRefs);
  const observedRefs = [...observationRefs];
  const normalized = new Map();
  const basenames = new Map();
  for (const ref of observedRefs) {
    const norm = normalizeSourceRef(ref);
    if (!normalized.has(norm)) normalized.set(norm, []);
    normalized.get(norm).push(ref);
    const base = basenameOf(norm);
    if (!basenames.has(base)) basenames.set(base, []);
    basenames.get(base).push(ref);
  }

  const rows = [];
  for (const row of packets.rows) {
    const sourceRef = String(row.source_ref);
    const norm = normalizeSourceRef(sourceRef);
    const normMatches = [...new Set(normalized.get(norm) ?? [])];
    const baseMatches = [...new Set(basenames.get(basenameOf(norm)) ?? [])];
    let classification;
    let reason;
    if (observationRefs.has(sourceRef)) {
      classification = 'CURRENT_WORKSPACE_EXACT';
      reason = graphifyRaw.has(sourceRef)
        ? 'raw_source_ref_matches_workspace_observation_and_graphify'
        : 'raw_source_ref_matches_workspace_observation_graphify_missing';
    } else if (normMatches.length === 1) {
      classification = 'KNOWN_CANONICAL_ALIAS';
      reason = 'unique_normalized_workspace_observation_ref';
    } else if (baseMatches.length > 1) {
      classification = 'AMBIGUOUS';
      reason = 'basename_maps_to_multiple_graphify_sources';
    } else if (historicalPattern.test(sourceRef)) {
      classification = 'HISTORICAL_ARTIFACT';
      reason = 'legacy_artifact_shape_requires_explicit_bridge';
    } else if (nonCanonicalPrefix.test(sourceRef)) {
      classification = 'NON_CANONICAL_SCOPE';
      reason = 'known_external_or_nested_scope_not_in_current_workspace_observation';
    } else {
      classification = 'UNRESOLVED';
      reason = 'no_exact_normalized_or_policy-backed_identity';
    }
    const observation = observationBindings.get(sourceRef) ?? observationBindings.get(normMatches[0]);
    rows.push({
      packetSourceRef: sourceRef,
      normalizedPacketSourceRef: norm,
      canonicalSourceRef: observation?.sourceRef ?? null,
      resolution: classification,
      workspaceRevision: observation?.workspaceRevision ?? null,
      sourceRevision: observation?.sourceRevision ?? null,
      graphifySourceRef: graphifyRaw.has(sourceRef) ? sourceRef : null,
      workspaceBindingChecksum: null,
      confidence: classification === 'CURRENT_WORKSPACE_EXACT' || classification === 'KNOWN_CANONICAL_ALIAS' ? 1 : 0,
      evidenceRefs: observation ? ['docs/reports/workspace-source-binding-observation.json'] : [],
      resolverRevision: 'atlas-packet-source-coverage-v1',
      packetCount: Number(row.packet_count), classification, reason,
      normalizedMatches: normMatches.slice(0, 8), basenameMatches: baseMatches.slice(0, 8),
    });
  }
  await pool.end();
  const counts = Object.fromEntries([...new Set(rows.map((row) => row.classification))]
    .map((classification) => [classification, rows.filter((row) => row.classification === classification).length]));
  const packetCounts = Object.fromEntries([...new Set(rows.map((row) => row.classification))]
    .map((classification) => [classification, rows.filter((row) => row.classification === classification)
      .reduce((sum, row) => sum + row.packetCount, 0)]));
  const eligible = rows.filter((row) => row.classification === 'CURRENT_WORKSPACE_EXACT')
    .map((row) => row.sourceRef).sort();
  const eligibleMissing = eligible.filter((sourceRef) => !graphifyRaw.has(sourceRef));
  const selectionChecksum = crypto.createHash('sha256').update(eligibleMissing.join('\n')).digest('hex');
  const report = {
    schema: 'atlas.graphify-packet-source-coverage-v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    sourceObservation: 'docs/reports/workspace-source-binding-observation.json',
    classificationPolicy: {
      CURRENT_WORKSPACE_EXACT: 'raw Graphify source_ref plus observed workspace binding',
      KNOWN_CANONICAL_ALIAS: 'unique normalized Graphify ref plus observed workspace binding',
      HISTORICAL_ARTIFACT: 'legacy date-like or .txt packet reference; bridge required',
      NON_CANONICAL_SCOPE: 'known nested/external scope; never current-workspace eligible',
      AMBIGUOUS: 'multiple Graphify candidates by basename; rejected',
      UNRESOLVED: 'no policy-backed identity; rejected',
    },
    counts,
    packetCounts,
    bindingContract: 'SourceRefBindingCandidateV1',
    eligibleCurrentWorkspaceExact: eligible.length,
    graphifyExactAlreadyPresent: eligible.length - eligibleMissing.length,
    eligibleMissingCurrentWorkspaceExact: eligibleMissing.length,
    eligibleSelectionChecksum: selectionChecksum,
    eligibleSourceRefs: eligibleMissing,
    samples: Object.fromEntries([...new Set(rows.map((row) => row.classification))]
      .map((classification) => [classification, rows.filter((row) => row.classification === classification).slice(0, 25)])),
    nextGate: 'SELECT_ONLY_CURRENT_WORKSPACE_EXACT_FOR_BOUNDED_GRAPHIFY_BATCH',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, readOnly: true, counts, eligibleCurrentWorkspaceExact: eligible.length, eligibleSelectionChecksum: selectionChecksum, report: REPORT }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[graphify-packet-source-coverage] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
