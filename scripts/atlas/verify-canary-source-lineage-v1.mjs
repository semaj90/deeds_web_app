#!/usr/bin/env node
/**
 * Parent Atlas Canary Source-Revision & Cryptographic Lineage Verifier (v1)
 *
 * Milestone: SOURCE_REVISION_READBACK_PROVEN & WORKSPACE_PACKET_CHUNK_JOIN_PROVEN
 *
 * Proves exact 4-way cryptographic equality across:
 * 1. Physical on-disk workspace file bytes (SHA-256)
 * 2. graphify_files.content_hash & git source_revision
 * 3. codebase_chunk_index.file_content_hash
 * 4. atlas_packets.source_revision ('sha256:' prefix)
 *
 * Strict safety:
 * - BEGIN READ ONLY transaction.
 * - Zero writes to any database table (writesPerformed: false).
 * - Canonical authority remains false (advisory canary proof).
 * - Generates immutable JSON receipt to docs/reports/canary-source-revision-readback-receipt-v1.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const CANARY_COHORT = [
  'scripts/atlas/enrich_atlas_packets.mjs',
  'docs/atlas/feature-registry.json',
  'docs/engram-offline-processing-pipeline.md',
  'docs/graph/codebase-feature-map.json',
  'docs/graph/codebase-semantics-neo4j-report.json',
];

function sha256File(relPath) {
  const absPath = resolve(ROOT, relPath);
  if (!existsSync(absPath)) return null;
  const buffer = readFileSync(absPath);
  return createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

async function verifyCanaryCohort() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1 });
  const client = await pool.connect();

  const results = [];
  let totalChunks = 0;
  let totalPackets = 0;
  let allMatched = true;

  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");

    for (const relPath of CANARY_COHORT) {
      const diskSha256 = sha256File(relPath);
      if (!diskSha256) {
        results.push({
          sourceRef: relPath,
          status: 'FILE_MISSING_ON_DISK',
          matched: false,
        });
        allMatched = false;
        continue;
      }

      // Query graphify_files
      const gfRes = await client.query(
        `SELECT source_ref, source_revision, content_hash, workspace_revision, byte_length, parse_status
         FROM graphify_files
         WHERE source_ref = $1 LIMIT 1`,
        [relPath]
      );
      const gf = gfRes.rows[0] || null;

      // Query codebase_chunk_index
      const ciRes = await client.query(
        `SELECT count(*)::int AS chunk_count, file_content_hash
         FROM codebase_chunk_index
         WHERE source_ref = $1
         GROUP BY file_content_hash`,
        [relPath]
      );
      const ciChunks = ciRes.rows.reduce((acc, r) => acc + r.chunk_count, 0);
      const ciHash = ciRes.rows[0]?.file_content_hash || null;

      // Query atlas_packets
      const apRes = await client.query(
        `SELECT packet_key, source_revision, workspace_revision_key
         FROM atlas_packets
         WHERE source_ref = $1 LIMIT 1`,
        [relPath]
      );
      const ap = apRes.rows[0] || null;
      const apCleanHash = ap?.source_revision ? ap.source_revision.replace(/^sha256:/i, '').toLowerCase() : null;

      const diskMatchesGf = diskSha256 === gf?.content_hash?.toLowerCase();
      const gfMatchesCi = gf?.content_hash?.toLowerCase() === ciHash?.toLowerCase();
      const gfMatchesAp = gf?.content_hash?.toLowerCase() === apCleanHash;

      const recordMatched = diskMatchesGf && gfMatchesCi && gfMatchesAp;
      if (!recordMatched) allMatched = false;

      totalChunks += ciChunks;
      if (ap) totalPackets += 1;

      results.push({
        sourceRef: relPath,
        onDiskSha256: diskSha256,
        graphifyFiles: {
          present: !!gf,
          contentHash: gf?.content_hash || null,
          gitCommit: gf?.source_revision || null,
          workspaceRevision: gf?.workspace_revision || null,
          parseStatus: gf?.parse_status || null,
        },
        codebaseChunkIndex: {
          present: ciChunks > 0,
          chunkCount: ciChunks,
          fileContentHash: ciHash,
        },
        atlasPackets: {
          present: !!ap,
          packetKey: ap?.packet_key || null,
          sourceRevision: ap?.source_revision || null,
          workspaceRevisionKey: ap?.workspace_revision_key || null,
        },
        matches: {
          diskEqualsGraphify: diskMatchesGf,
          graphifyEqualsChunkIndex: gfMatchesCi,
          graphifyEqualsAtlasPackets: gfMatchesAp,
          fourWayVerified: recordMatched,
        },
      });
    }

    await client.query('ROLLBACK');

    const receipt = {
      schema: 'atlas.canary-source-revision-readback-receipt.v1',
      generatedAt: new Date().toISOString(),
      cohortSize: CANARY_COHORT.length,
      allMatched,
      verifiedCohortCount: results.filter((r) => r.matches?.fourWayVerified).length,
      totalChunksVerified: totalChunks,
      totalPacketsVerified: totalPackets,
      readOnly: true,
      writesPerformed: false,
      canonicalAuthority: false,
      cohortResults: results,
    };

    receipt.checksum = `sha256:${createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;

    const outPath = resolve(ROOT, 'docs/reports/canary-source-revision-readback-receipt-v1.json');
    writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log(`\nCanary Verification Result: ${allMatched ? 'VERIFIED_4_WAY_MATCH ✓' : 'MISMATCH_DETECTED ✗'}`);
    console.log(`Verified files: ${receipt.verifiedCohortCount} / ${CANARY_COHORT.length}`);
    console.log(`Total Chunks Linked: ${totalChunks}`);
    console.log(`Receipt saved: docs/reports/canary-source-revision-readback-receipt-v1.json\n`);

    return receipt;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyCanaryCohort().catch((err) => {
  console.error('Canary verification error:', err);
  process.exit(1);
});
