#!/usr/bin/env node

/** Read-only STRUCT-13E audit for the current CandidateOrdinal source cohort. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.join(root, 'docs/reports/structural-legacy-coverage-v1.json');
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

async function main() {
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const candidates = (map.candidates ?? []).filter((row) => row.sourceRef && row.sourceRevision && row.workspaceRevision === map.workspaceRevision);
  if (candidates.length === 0) throw new Error('STRUCTURAL_LEGACY_COVERAGE_MAP_EMPTY');
  const refs = [...new Set(candidates.map((row) => row.sourceRef))].sort();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000 });
  try {
    const result = await pool.query(`
      SELECT source_ref,
             count(*)::int AS packet_count,
             count(function_symbol)::int AS function_symbol_count,
             count(tree_node_id)::int AS tree_node_count,
             count(*) FILTER (WHERE source_ref = canonical_source_ref)::int AS exact_canonical_count,
             count(*) FILTER (WHERE source_ref <> canonical_source_ref)::int AS namespace_variant_count
        FROM atlas_packets
       WHERE source_ref = ANY($1::text[])
          OR canonical_source_ref = ANY($1::text[])
       GROUP BY source_ref
       ORDER BY source_ref
    `, [refs]);
    const byRef = new Map(result.rows.map((row) => [row.source_ref, row]));
    const rows = candidates.map((candidate) => {
      const row = byRef.get(candidate.sourceRef);
      return {
        candidateOrdinal: candidate.candidateOrdinal,
        packetKey: candidate.packetKey,
        sourceRef: candidate.sourceRef,
        sourceRevision: candidate.sourceRevision,
        workspaceRevision: candidate.workspaceRevision,
        packetCount: Number(row?.packet_count ?? 0),
        functionSymbolCount: Number(row?.function_symbol_count ?? 0),
        treeNodeCount: Number(row?.tree_node_count ?? 0),
        exactCanonicalCount: Number(row?.exact_canonical_count ?? 0),
        namespaceVariantCount: Number(row?.namespace_variant_count ?? 0),
        classification: Number(row?.function_symbol_count ?? 0) > 0 ? 'LEGACY_STRUCTURAL_COVERAGE_PRESENT' : 'LEGACY_STRUCTURAL_COVERAGE_MISSING',
      };
    });
    const reportBase = {
      schema: 'atlas.structural-legacy-coverage-v1',
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
      workspaceRevision: map.workspaceRevision,
      selectedSourceCount: refs.length,
      counts: {
        packetRows: rows.reduce((sum, row) => sum + row.packetCount, 0),
        functionSymbolRows: rows.reduce((sum, row) => sum + row.functionSymbolCount, 0),
        treeNodeRows: rows.reduce((sum, row) => sum + row.treeNodeCount, 0),
        coveragePresent: rows.filter((row) => row.classification === 'LEGACY_STRUCTURAL_COVERAGE_PRESENT').length,
        coverageMissing: rows.filter((row) => row.classification === 'LEGACY_STRUCTURAL_COVERAGE_MISSING').length,
      },
      rows,
      reconciliation: {
        required: rows.some((row) => row.classification === 'LEGACY_STRUCTURAL_COVERAGE_MISSING'),
        scope: 'current CandidateOrdinal-mapped source refs only',
        permittedProducer: '8095 structural observations or an independently proven indexed structural projection',
        prohibited: ['basename matching', 'fuzzy source resolution', 'synthetic revisions', 'automatic RRF admission'],
      },
      writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, rrf: false },
      canonicalAuthority: false,
      status: rows.some((row) => row.classification === 'LEGACY_STRUCTURAL_COVERAGE_MISSING')
        ? 'STRUCTURAL_LEGACY_COVERAGE_MISSING'
        : 'STRUCTURAL_LEGACY_COVERAGE_PRESENT',
    };
    const report = { ...reportBase, reportChecksum: `sha256:${sha256(JSON.stringify(reportBase))}` };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ status: report.status, selectedSourceCount: refs.length, packetRows: report.counts.packetRows, functionSymbolRows: report.counts.functionSymbolRows, reportPath: path.relative(root, reportPath) }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
