#!/usr/bin/env node
/**
 * Read-only candidate audit for the XGBoost trace-label bridge.
 *
 * This script never creates bridge entries and never writes to Postgres.
 * Every suggestion is PROPOSED_NOT_GROUND_TRUTH until reviewed with source
 * evidence and converted into the checked bridge contract.
 */

import pg from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const REPORT_PATH = path.resolve(ROOT, 'docs/reports/xgboost-trace-label-candidates.json');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function tokens(value) {
  return new Set(String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1));
}

function overlap(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / new Set([...a, ...b]).size;
}

function candidateScore(label, packet) {
  return Math.max(
    overlap(label, packet.feature_id),
    overlap(label, packet.feature_label),
    overlap(label, packet.source_ref),
  );
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    const { rows: traces } = await pool.query(`
      SELECT retrieved_packets
      FROM agent_traces
      WHERE retrieved_packets IS NOT NULL
        AND jsonb_array_length(retrieved_packets) > 0
      ORDER BY created_at DESC
    `);
    const labels = [...new Set(traces.flatMap((trace) => (trace.retrieved_packets ?? [])
      .filter((ref) => typeof ref === 'string' && ref.startsWith('packet:'))
      .map((ref) => ref.split(':')[1])
      .filter(Boolean)))].sort();
    const traceRefs = traces.flatMap((trace) => trace.retrieved_packets ?? [])
      .filter((ref) => typeof ref === 'string');
    const syntheticPacketRefs = traceRefs.filter((ref) => /^packet:[^:]+:\d+$/.test(ref));
    const canonicalPacketKeyRefs = traceRefs.filter((ref) => !ref.startsWith('concept:') && !/^packet:[^:]+:\d+$/.test(ref));

    const { rows: packets } = await pool.query(`
      SELECT packet_key, feature_id, feature_label, source_ref
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND (feature_id IS NOT NULL OR feature_label IS NOT NULL OR source_ref IS NOT NULL)
    `);

    const suggestions = labels.map((traceLabel) => {
      const ranked = packets
        .map((packet) => ({
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          feature_label: packet.feature_label,
          source_ref: packet.source_ref,
          score: Number(candidateScore(traceLabel, packet).toFixed(6)),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || String(a.packet_key).localeCompare(String(b.packet_key)))
        .slice(0, 10);
      const topScore = ranked[0]?.score ?? 0;
      const ties = ranked.filter((candidate) => candidate.score === topScore).length;
      return {
        trace_label: traceLabel,
        status: 'PROPOSED_NOT_GROUND_TRUTH',
        promotion_allowed: false,
        top_score: topScore,
        ambiguous_top_ties: topScore > 0 ? ties : 0,
        candidates: ranked,
        review_required: true,
        review_reason: topScore === 0
          ? 'NO_TOKEN_OVERLAP'
          : ties > 1
            ? 'AMBIGUOUS_CARDINALITY'
            : 'SOURCE_EVIDENCE_REQUIRED',
      };
    });

    const report = {
      schema: 'atlas.xgboost-trace-label-candidate-audit.v1',
      generated_at: new Date().toISOString(),
      read_only: true,
      database_url_role: 'proxy_or_shared_database_no_migrations',
      traces_loaded: traces.length,
      trace_labels: labels.length,
      packets_scanned: packets.length,
      trace_ref_shape: {
        total_refs: traceRefs.length,
        synthetic_packet_refs: syntheticPacketRefs.length,
        canonical_packet_key_refs: canonicalPacketKeyRefs.length,
        canonical_identity_fields_present: false,
      },
      identity_gap: 'TRACE_REFS_HAVE_LABEL_AND_ORDINAL_ONLY',
      suggestions,
      promotion_allowed: false,
      next_gate: 'HUMAN_REVIEW_WITH_SOURCE_EVIDENCE',
    };
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({
      report_path: REPORT_PATH,
      traces_loaded: traces.length,
      trace_labels: labels.length,
      packets_scanned: packets.length,
      suggestions: suggestions.length,
      promotion_allowed: false,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
