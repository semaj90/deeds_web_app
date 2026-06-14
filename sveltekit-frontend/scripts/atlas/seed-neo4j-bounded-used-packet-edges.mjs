#!/usr/bin/env node
/**
 * Bounded Neo4j seed from the agent trace spine.
 *
 * Dry-run by default. When --apply is present, writes only USED_CONCEPT and
 * USED_PACKET edges in bounded batches. The canonical source remains Postgres.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(APP_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'neo4j-used-concept-seed-report.json');
const OUT_MD = path.join(REPORTS_DIR, 'neo4j-used-concept-seed-report.md');
const DEFAULT_LIMIT = 250;
const DEFAULT_BATCH_SIZE = 50;

loadAtlasEnv(APP_ROOT);

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [flag, inline] = arg.split('=', 2);
    if (inline !== undefined) {
      args.set(flag, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args.set(flag, next);
      i += 1;
    } else {
      args.set(flag, true);
    }
  }
  return args;
}

const argv = parseArgs(process.argv.slice(2));
const APPLY = argv.has('--apply');
const LIMIT = Number(argv.get('--limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
const BATCH_SIZE = Math.max(1, Number(argv.get('--batch-size') ?? DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE);
const VERBOSE = argv.has('--verbose');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.replace(/\s+/g, ' ') : null;
}

function normalizePathLike(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\.?\.\//, '').replace(/^deeds-web-app\//i, '').replace(/^sveltekit-frontend\//i, '').replace(/\/+/g, '/').toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function extractConcepts(value) {
  const out = new Set();
  for (const entry of toArray(value)) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'string') {
      const normalized = normalizeText(entry);
      if (normalized) out.add(normalized);
      continue;
    }
    if (typeof entry === 'object') {
      const candidate = normalizeText(
        entry.concept_id ??
          entry.conceptId ??
          entry.feature_id ??
          entry.featureId ??
          entry.id ??
          entry.name ??
          entry.label ??
          entry.concept
      );
      if (candidate) out.add(candidate);
    }
  }
  return [...out];
}

function extractPacketCandidates(value) {
  const out = new Set();
  for (const entry of toArray(value)) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'string') {
      const normalized = normalizeText(entry);
      if (normalized) out.add(normalized);
      continue;
    }
    if (typeof entry === 'object') {
      const candidates = [
        entry.packet_key,
        entry.packetKey,
        entry.packet_id,
        entry.packetId,
        entry.source_ref_key,
        entry.sourceRefKey,
        entry.source_ref,
        entry.sourceRef,
        entry.file_path,
        entry.filePath,
        entry.path,
        entry.id,
      ];
      for (const candidate of candidates) {
        const normalized = normalizeText(candidate);
        if (normalized) out.add(normalized);
      }
    }
  }
  return [...out];
}

function compactObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Neo4j USED_CONCEPT / USED_PACKET Seed Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.apply ? 'apply' : 'dry-run'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- traces scanned: ${report.tracesScanned}`);
  lines.push(`- traces eligible: ${report.tracesEligible}`);
  lines.push(`- unique concepts: ${report.uniqueConcepts}`);
  lines.push(`- unique packets: ${report.uniquePackets}`);
  lines.push(`- USED_CONCEPT edges prepared: ${report.usedConceptEdgesPrepared}`);
  lines.push(`- USED_PACKET edges prepared: ${report.usedPacketEdgesPrepared}`);
  lines.push(`- Neo4j available: ${report.neo4j.available ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Packet Ledger');
  lines.push('');
  lines.push(`- ledger source: ${report.packetLedger.source}`);
  lines.push(`- canonical rows matched: ${report.packetLedger.matchedRows}`);
  lines.push(`- legacy-only packet refs: ${report.packetLedger.legacyOnlyCount}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Dry-run is the default.');
  lines.push('- USED_CONCEPT edges are derived from selected_concepts.');
  lines.push('- USED_PACKET edges are derived from retrieved_packets.');
  lines.push('- Traversal stays anchored on packet_key / source_ref_key roots.');
  lines.push('');
  return lines.join('\n');
}

async function createNeo4jDriver() {
  const uri = String(process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687').trim();
  const user = String(process.env.NEO4J_USER || 'neo4j').trim() || 'neo4j';
  const password = String(process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j').trim() || 'neo4j';
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true,
    connectionTimeout: 5000,
    maxTransactionRetryTime: 0,
  });
  return { driver, uri };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const dbUrl = resolveDatabaseUrl(process.env);
  const pool = new Pool({ connectionString: dbUrl, max: 1, allowExitOnIdle: true });

  const report = {
    generatedAt,
    apply: APPLY,
    limit: LIMIT,
    batchSize: BATCH_SIZE,
    neo4j: {
      available: false,
      uri: String(process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687').trim(),
      error: null,
    },
    packetLedger: {
      source: 'unresolved',
      matchedRows: 0,
      legacyOnlyCount: 0,
    },
    tracesScanned: 0,
    tracesEligible: 0,
    uniqueConcepts: 0,
    uniquePackets: 0,
    usedConceptEdgesPrepared: 0,
    usedPacketEdgesPrepared: 0,
    usedConceptEdgesWritten: 0,
    usedPacketEdgesWritten: 0,
    skippedConcepts: 0,
    skippedPackets: 0,
    unmatchedPacketRefs: 0,
    batches: [],
    samples: [],
  };

  try {
    const ledgerProbe = await pool.query(`SELECT to_regclass('public.atlas_feature_packets') IS NOT NULL AS exists`);
    const useFeatureLedger = Boolean(ledgerProbe.rows[0]?.exists);
    report.packetLedger.source = useFeatureLedger ? 'atlas_feature_packets' : 'atlas_packets';

    const traceResult = await pool.query(
      `
        SELECT
          trace_id,
          retrieval_strategy,
          outcome,
          score,
          created_at,
          selected_concepts,
          retrieved_packets
        FROM agent_traces
        WHERE COALESCE(jsonb_array_length(selected_concepts), 0) > 0
           OR COALESCE(jsonb_array_length(retrieved_packets), 0) > 0
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [LIMIT]
    );

    report.tracesScanned = traceResult.rowCount ?? 0;

    const traceRows = [];
    const conceptSet = new Set();
    const packetRefs = new Set();

    for (const row of traceResult.rows) {
      const concepts = extractConcepts(row.selected_concepts);
      const packets = extractPacketCandidates(row.retrieved_packets);
      for (const concept of concepts) conceptSet.add(concept);
      for (const packet of packets) packetRefs.add(packet);

      if (concepts.length === 0 && packets.length === 0) continue;

      traceRows.push({
        traceId: normalizeText(row.trace_id),
        retrievalStrategy: normalizeText(row.retrieval_strategy) ?? 'fusion',
        outcome: normalizeText(row.outcome) ?? 'partial',
        score: Number(row.score ?? 0),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : generatedAt,
        concepts: concepts.map((conceptId) => ({ conceptId })),
        packets: packets.map((candidate) => ({ candidate })),
      });
    }

    report.tracesEligible = traceRows.length;
    report.uniqueConcepts = conceptSet.size;
    report.uniquePackets = packetRefs.size;

    const packetLedgerRows = packetRefs.size > 0
      ? await pool.query(
          useFeatureLedger
            ? `
              SELECT
                packet_key,
                source_ref,
                feature_id,
                feature_label,
                community_id,
                community_confidence,
                file_path,
                lineage_version,
                ledger_type,
                metadata
              FROM atlas_feature_packets
              WHERE packet_key = ANY($1::text[])
                 OR source_ref = ANY($1::text[])
                 OR file_path = ANY($1::text[])
            `
            : `
              SELECT
                packet_key,
                source_ref,
                source_ref_key,
                feature_id,
                feature_label,
                community_id,
                community_confidence,
                file_path,
                NULL::text AS lineage_version,
                'atlas_packets'::text AS ledger_type,
                metadata
              FROM atlas_packets
              WHERE COALESCE(packet_key, '') = ANY($1::text[])
                 OR COALESCE(source_ref, '') = ANY($1::text[])
                 OR COALESCE(source_ref_key, '') = ANY($1::text[])
                 OR COALESCE(file_path, '') = ANY($1::text[])
            `,
          [Array.from(packetRefs)]
        )
      : { rows: [] };

    const packetLedgerMap = new Map();
    for (const row of packetLedgerRows.rows ?? []) {
      for (const candidate of [
        row.packet_key,
        row.source_ref,
        row.source_ref_key,
        row.file_path,
      ]) {
        const normalized = normalizePathLike(candidate);
        if (normalized && !packetLedgerMap.has(normalized)) {
          packetLedgerMap.set(normalized, row);
        }
      }
    }

    const matchedPacketRefs = new Set();
    for (const ref of packetRefs) {
      const normalized = normalizePathLike(ref) ?? '';
      if (normalized && packetLedgerMap.has(normalized)) matchedPacketRefs.add(ref);
    }

    report.packetLedger.matchedRows = packetLedgerRows.rowCount ?? 0;
    report.packetLedger.legacyOnlyCount = packetRefs.size - matchedPacketRefs.size;

    const preparedRows = traceRows.map((row) => {
      const packetNodes = [];
      for (const packet of row.packets) {
        const normalizedCandidate = normalizePathLike(packet.candidate);
        const ledgerRow = normalizedCandidate ? packetLedgerMap.get(normalizedCandidate) : null;

        const packetKey = normalizeText(ledgerRow?.packet_key);
        const sourceRef = normalizeText(ledgerRow?.source_ref);
        const sourceRefKey = normalizeText(ledgerRow?.source_ref_key);
        const filePath = normalizeText(ledgerRow?.file_path);
        const featureId = normalizeText(ledgerRow?.feature_id);
        const featureLabel = normalizeText(ledgerRow?.feature_label);
        const communityId = ledgerRow?.community_id ?? null;
        const communityConfidence = ledgerRow?.community_confidence ?? null;
        const ledgerType = normalizeText(ledgerRow?.ledger_type) ?? 'legacy_qdrant_only';
        const lineageVersion = normalizeText(ledgerRow?.lineage_version) ?? 'packet-identity-v1';
        const identityKey =
          packetKey ??
          sourceRefKey ??
          sourceRef ??
          filePath ??
          normalizedCandidate ??
          packet.candidate;

        const nodeProps = compactObject({
          id: identityKey,
          packet_key: packetKey,
          source_ref_key: sourceRefKey ?? sourceRef,
          source_ref: sourceRef ?? sourceRefKey,
          file_path: filePath,
          feature_id: featureId,
          feature_label: featureLabel,
          community_id: communityId,
          community_confidence: communityConfidence,
          ledger_type: ledgerType,
          lineage_version: lineageVersion,
          canonical: Boolean(ledgerRow),
        });

        packetNodes.push({
          identityKey,
          nodeProps,
          candidate: packet.candidate,
          matched: Boolean(ledgerRow),
        });
      }

      return {
        ...row,
        concepts: row.concepts,
        packets: packetNodes,
      };
    });

    report.usedConceptEdgesPrepared = preparedRows.reduce((sum, row) => sum + row.concepts.length, 0);
    report.usedPacketEdgesPrepared = preparedRows.reduce((sum, row) => sum + row.packets.length, 0);
    report.skippedConcepts = 0;
    report.skippedPackets = 0;
    report.unmatchedPacketRefs = report.packetLedger.legacyOnlyCount;
    report.samples = preparedRows.slice(0, 5).map((row) => ({
      traceId: row.traceId,
      concepts: row.concepts.slice(0, 5).map((concept) => concept.conceptId),
      packets: row.packets.slice(0, 5).map((packet) => ({
        identityKey: packet.identityKey,
        matched: packet.matched,
        nodeProps: packet.nodeProps,
      })),
    }));

    let neo4jStatus = { available: false, error: null, uri: report.neo4j.uri };
    if (APPLY) {
      const created = await createNeo4jDriver();
      const driver = created.driver;
      try {
        const session = driver.session({ database: 'neo4j' });
        try {
          await session.run('RETURN 1 AS ok');
          neo4jStatus = { available: true, error: null, uri: created.uri };

          for (let i = 0; i < preparedRows.length; i += BATCH_SIZE) {
            const batch = preparedRows.slice(i, i + BATCH_SIZE);
            const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

            const batchQuery = `
              UNWIND $rows AS row
              MERGE (t:Trace {trace_id: row.traceId})
              SET t.id = row.traceId,
                  t.retrieval_strategy = row.retrievalStrategy,
                  t.outcome = row.outcome,
                  t.reward = row.score,
                  t.created_at = datetime(row.createdAt)
              FOREACH (concept IN row.concepts |
                MERGE (c:Concept {id: concept.conceptId})
                SET c.concept_id = concept.conceptId,
                    c.name = coalesce(c.name, concept.conceptId)
                MERGE (t)-[r:USED_CONCEPT]->(c)
                SET r.outcome = row.outcome,
                    r.score = row.score,
                    r.strategy = row.retrievalStrategy,
                    r.created_at = datetime(row.createdAt)
              )
              FOREACH (packet IN row.packets |
                MERGE (p:Packet {id: packet.identityKey})
                SET p += packet.nodeProps
                MERGE (t)-[r:USED_PACKET]->(p)
                SET r.outcome = row.outcome,
                    r.score = row.score,
                    r.strategy = row.retrievalStrategy,
                    r.created_at = datetime(row.createdAt)
              )
              RETURN count(*) AS rowsProcessed
            `;

            await session.executeWrite((tx) => tx.run(batchQuery, { rows: batch }));
            report.batches.push({
              batchIndex,
              traces: batch.length,
              concepts: batch.reduce((sum, row) => sum + row.concepts.length, 0),
              packets: batch.reduce((sum, row) => sum + row.packets.length, 0),
            });
          }

          report.usedConceptEdgesWritten = report.usedConceptEdgesPrepared;
          report.usedPacketEdgesWritten = report.usedPacketEdgesPrepared;
        } finally {
          await session.close().catch(() => {});
        }
      } finally {
        await driver.close().catch(() => {});
      }
    } else {
      neo4jStatus = { available: false, error: 'dry-run', uri: report.neo4j.uri };
      report.batches = [];
      for (let i = 0; i < preparedRows.length; i += BATCH_SIZE) {
        const batch = preparedRows.slice(i, i + BATCH_SIZE);
        report.batches.push({
          batchIndex: Math.floor(i / BATCH_SIZE) + 1,
          traces: batch.length,
          concepts: batch.reduce((sum, row) => sum + row.concepts.length, 0),
          packets: batch.reduce((sum, row) => sum + row.packets.length, 0),
        });
      }
    }

    report.neo4j = neo4jStatus;
    report.totalTraceRowsWithEdges = preparedRows.length;

    await fsp.mkdir(REPORTS_DIR, { recursive: true });
    await fsp.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fsp.writeFile(OUT_MD, buildMarkdown(report), 'utf8');

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
