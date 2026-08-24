#!/usr/bin/env node
/**
 * Read-only bridge from enriched callable rows to packet-level ORF planning.
 * upstream_chunk_id is used only as an inspected provenance candidate; this
 * script never promotes it to canonical packet identity or writes ORF rows.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const OUT = path.resolve(ROOT, '.tmp/atlas/graphify-file-index-v1/callable-enrichment-orf-plan.jsonl');
const REPORT = path.resolve(ROOT, 'docs/reports/ast-callable-enrichment-orf-plan-v1.json');
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = (values) => [...new Set(values.filter(Boolean))].sort();
const pool = new pg.Pool({ connectionString: DATABASE_URL });

const result = await pool.query(`
  SELECT c.symbol_version_id, c.source_ref, c.source_revision, c.qualified_name,
         c.domain_id, c.domain_confidence, c.secondary_domains, c.inferred_uses,
         c.enrichment_metadata, c.callable_metadata, c.node_kind, v.upstream_chunk_id,
         v.packet_key AS version_packet_key, ap.packet_key AS canonical_packet_key
    FROM atlas_callable_search c
    JOIN atlas_symbol_versions v ON v.symbol_version_id = c.symbol_version_id
    LEFT JOIN atlas_packets ap ON ap.packet_key = COALESCE(v.packet_key, v.upstream_chunk_id)
   ORDER BY c.symbol_version_id
`);
await pool.end();

const groups = new Map();
const unresolved = [];
for (const row of result.rows) {
  const packetKey = row.canonical_packet_key || null;
  if (!packetKey) { unresolved.push(row.symbol_version_id); continue; }
  const group = groups.get(packetKey) || [];
  group.push(row);
  groups.set(packetKey, group);
}

const plans = [...groups.entries()].map(([packetKey, rows]) => {
  const plan = {
    schema: 'atlas.callable-enrichment-orf-plan-row.v1',
    packetKey,
    featureRevision: 'atlas-callable-enrichment-v1',
    sourceRef: rows[0].source_ref,
    sourceRevision: rows[0].source_revision,
    symbolCount: rows.length,
    symbolNames: unique(rows.map((row) => row.qualified_name)),
    symbolKinds: unique(rows.map((row) => row.node_kind || row.callable_metadata?.kind)),
    domainIds: unique(rows.map((row) => row.domain_id)),
    inferredUses: unique(rows.flatMap((row) => row.inferred_uses || [])),
    evidenceRefs: unique(rows.map((row) => row.enrichment_metadata?.classification_id)),
    canonicalWrite: false,
  };
  return { ...plan, inputDigest: digest(plan) };
}).sort((a, b) => a.packetKey.localeCompare(b.packetKey));

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.mkdir(path.dirname(REPORT), { recursive: true });
await fs.writeFile(OUT, plans.map((row) => JSON.stringify(row)).join('\n') + (plans.length ? '\n' : ''));
const report = {
  schema: 'atlas.ast-callable-enrichment-orf-plan-receipt.v1',
  readOnly: true,
  databaseWrites: false,
  callableRows: result.rows.length,
  packetPlans: plans.length,
  packetProvenanceCandidates: result.rows.length - unresolved.length,
  canonicalPacketMatches: result.rows.filter((row) => row.canonical_packet_key).length,
  unresolvedPacketProvenance: unresolved.length,
  domainRows: result.rows.filter((row) => row.domain_id).length,
  inferredUseRows: result.rows.filter((row) => (row.inferred_uses || []).length > 0).length,
  output: OUT,
  planChecksum: digest(plans),
  sample: plans.slice(0, 5),
  nextGate: 'REVIEW_PACKET_PROVENANCE_BEFORE_ORF_MATERIALIZATION',
};
await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
