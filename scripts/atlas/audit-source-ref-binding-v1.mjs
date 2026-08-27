#!/usr/bin/env node
/**
 * Read-only SourceRefBindingCandidateV1 audit.
 *
 * atlas_source_refs is treated as a canonical-source registry candidate, not
 * as proof by itself. A binding is promotion-eligible only when the packet
 * ref exactly matches a current workspace observation. Normalized matches are
 * reported for explicit-alias review and never promoted automatically.
 */
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
const REPORT = resolve(ROOT, 'docs/reports/source-ref-binding-v1.json');
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const text = (value) => String(value ?? '').trim();

const loadObservation = () => {
  try {
    const value = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json'), 'utf8'));
    return {
      workspaceRevision: text(value.record?.workspaceRevision),
      bindings: new Map((value.bindings ?? []).map((row) => [text(row.sourceRef), row])),
    };
  } catch {
    return { workspaceRevision: '', bindings: new Map() };
  }
};

async function main() {
  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'atlas_source_refs'
    ) AS present
  `);
  const observation = loadObservation();
  if (!tableCheck.rows[0]?.present) {
    const report = {
      schema: 'atlas.source-ref-binding.v1', generatedAt: new Date().toISOString(),
      readOnly: true, postgresWrites: false, status: 'SOURCE_REGISTRY_TABLE_UNAVAILABLE',
      bindingContract: 'SourceRefBindingCandidateV1',
      sourceObservation: 'docs/reports/workspace-source-binding-observation.json',
      counts: {}, candidates: [], nextGate: 'REVIEW_SOURCE_REGISTRY_SCHEMA',
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
    await pool.end();
    console.log(JSON.stringify({ status: report.status, report: REPORT }, null, 2));
    process.exitCode = 2;
    return;
  }

  const [packets, registry] = await Promise.all([
    pool.query(`SELECT source_ref, count(*)::integer AS packet_count
                FROM public.atlas_packets
                WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
                GROUP BY source_ref ORDER BY source_ref`),
    pool.query(`SELECT source_ref_key, repo_id, relative_path, content_hash,
                       commit_sha, corpus_version
                FROM public.atlas_source_refs
                WHERE NULLIF(btrim(source_ref_key), '') IS NOT NULL
                ORDER BY repo_id, source_ref_key`),
  ]);
  await pool.end();

  const observed = observation.bindings;
  const observedByNormalized = new Map();
  for (const [sourceRef, binding] of observed) {
    const key = normalizeSourceRef(sourceRef);
    const list = observedByNormalized.get(key) ?? [];
    list.push({ sourceRef, binding });
    observedByNormalized.set(key, list);
  }
  const registryExact = new Set(registry.rows.map((row) => text(row.source_ref_key)));
  const registryByNormalized = new Map();
  for (const row of registry.rows) {
    const key = normalizeSourceRef(text(row.source_ref_key));
    const list = registryByNormalized.get(key) ?? [];
    list.push(row);
    registryByNormalized.set(key, list);
  }

  const candidates = packets.rows.map((row) => {
    const packetSourceRef = text(row.source_ref);
    const normalizedPacketSourceRef = normalizeSourceRef(packetSourceRef);
    const exact = observed.get(packetSourceRef);
    const normalizedMatches = observedByNormalized.get(normalizedPacketSourceRef) ?? [];
    const registryMatches = registryByNormalized.get(normalizedPacketSourceRef) ?? [];
    let resolution = 'UNRESOLVED';
    let canonicalSourceRef = null;
    let binding = null;
    let reason = 'no exact or unique normalized current-workspace binding';
    if (exact) {
      resolution = 'EXACT';
      canonicalSourceRef = packetSourceRef;
      binding = exact;
      reason = 'packet source_ref exactly matches current workspace observation';
    } else if (normalizedMatches.length === 1 && registryMatches.length <= 1) {
      resolution = 'NORMALIZED_EXACT';
      canonicalSourceRef = normalizedMatches[0].sourceRef;
      binding = normalizedMatches[0].binding;
      reason = 'unique normalized current-workspace candidate; explicit alias approval required';
    } else if (normalizedMatches.length > 1 || registryMatches.length > 1) {
      resolution = 'AMBIGUOUS';
      reason = 'normalized source ref maps to multiple current or registry candidates';
    }
    const promotable = resolution === 'EXACT';
    return {
      packetSourceRef,
      normalizedPacketSourceRef,
      canonicalSourceRef,
      resolution,
      promotable,
      workspaceRevision: binding?.workspaceRevision ?? null,
      sourceRevision: binding?.sourceRevision ?? null,
      graphifySourceRef: canonicalSourceRef && observed.has(canonicalSourceRef) ? canonicalSourceRef : null,
      registryExact: registryExact.has(canonicalSourceRef ?? packetSourceRef),
      registryMatchCount: registryMatches.length,
      evidenceRefs: binding ? ['docs/reports/workspace-source-binding-observation.json'] : [],
      resolverRevision: 'source-ref-binding-v1',
      confidence: promotable ? 1 : 0,
      packetCount: Number(row.packet_count),
      reason,
    };
  });
  const countBy = (field) => Object.fromEntries([...new Set(candidates.map((row) => row[field]))]
    .sort().map((key) => [key, candidates.filter((row) => row[field] === key)
      .reduce((sum, row) => sum + row.packetCount, 0)]));
  const promotable = candidates.filter((row) => row.promotable).map((row) => row.packetSourceRef).sort();
  const report = {
    schema: 'atlas.source-ref-binding.v1', generatedAt: new Date().toISOString(),
    readOnly: true, postgresWrites: false, status: promotable.length ? 'CANDIDATES_FOUND' : 'NO_PROMOTABLE_BINDINGS',
    bindingContract: 'SourceRefBindingCandidateV1',
    sourceObservation: 'docs/reports/workspace-source-binding-observation.json',
    workspaceRevision: observation.workspaceRevision || null,
    registry: {
      table: 'public.atlas_source_refs', rows: registry.rows.length,
      distinctSourceRefs: registryExact.size,
      purpose: 'canonical-source registry candidate; not alias approval by itself',
    },
    counts: countBy('resolution'),
    packetRows: candidates.reduce((sum, row) => sum + row.packetCount, 0),
    promotableExactSourceRefs: promotable.length,
    promotableExactSelectionChecksum: sha256(promotable.join('\n')),
    policy: {
      promotable: ['EXACT', 'EXPLICIT_ALIAS'],
      reviewOnly: ['NORMALIZED_EXACT', 'HISTORICAL_ARTIFACT', 'NON_CANONICAL_SCOPE'],
      rejected: ['AMBIGUOUS', 'UNRESOLVED'],
      note: 'NORMALIZED_EXACT remains review-only until a durable approved alias relation exists',
    },
    candidates,
    nextGate: 'APPROVE_EXPLICIT_ALIASES_OR_RUN_EXACT_SOURCE_BATCH',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    schema: report.schema, status: report.status, readOnly: true,
    registryRows: report.registry.rows, counts: report.counts,
    promotableExactSourceRefs: report.promotableExactSourceRefs,
    promotableExactSelectionChecksum: report.promotableExactSelectionChecksum,
    report: REPORT,
  }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(`[source-ref-binding] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
