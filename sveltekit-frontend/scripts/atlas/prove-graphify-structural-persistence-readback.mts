#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '$lib/server/db/client.js';
import { classifyGraphifyStructuralPersistenceProofV1 } from '$lib/server/atlas/indexing/graphify-structural-persistence-proof-v1.js';
import { createEvidenceLedgerRepository } from '@deeds/parent-atlas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const DEFAULT_OUT = path.resolve(FRONTEND_ROOT, 'docs/reports/graphify-structural-persistence-readback.json');
const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const OUT = outArg ? path.resolve(process.cwd(), outArg.slice('--out='.length)) : DEFAULT_OUT;
const PRODUCER_REVISION = 'atlas.graphify-structural-persistence-proof.v1';

// This environment variable is intentionally explicit and defaults false.
// It must only be set by a separate accepted revision-owner proof. This script
// never derives revision ownership from content hashes, git commits, timestamps,
// parser tokens, or existing database values.
const REVISION_OWNER_PROVEN = process.env.ATLAS_SOURCE_REVISION_OWNER_PROVEN === '1';

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const tableResult = await client.query<{ exists: boolean }>(`
      SELECT to_regclass('public.atlas_evidence') IS NOT NULL AS exists
    `);
    const tableExists = tableResult.rows[0]?.exists === true;

    const columns = tableExists
      ? (await client.query<{ column_name: string; data_type: string; is_nullable: 'YES' | 'NO' }>(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'atlas_evidence'
          ORDER BY ordinal_position
        `)).rows.map((row) => ({
          name: row.column_name,
          dataType: row.data_type,
          nullable: row.is_nullable === 'YES',
        }))
      : [];

    const indexResult = tableExists
      ? await client.query<{ present: boolean }>(`
          SELECT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'atlas_evidence'
              AND indexdef ILIKE '%(source_ref, source_revision)%'
          ) AS present
        `)
      : { rows: [{ present: false }] };
    const sourceRevisionIndexPresent = indexResult.rows[0]?.present === true;

    const counts = tableExists
      ? (await client.query<{
          structural_count: string;
          suspicious_count: string;
        }>(`
          SELECT
            count(*) FILTER (WHERE evidence_kind = 'code.structural')::text AS structural_count,
            count(*) FILTER (
              WHERE evidence_kind = 'code.structural'
                AND (
                  source_revision LIKE 'content:%'
                  OR source_revision LIKE 'anchor:%'
                  OR source_revision LIKE 'content-sha256:%'
                  OR source_revision LIKE 'anchor:content:%'
                )
            )::text AS suspicious_count
          FROM atlas_evidence
        `)).rows[0]
      : { structural_count: '0', suspicious_count: '0' };

    const structuralRowCount = Number(counts?.structural_count ?? 0);
    const suspiciousPseudoRevisionCount = Number(counts?.suspicious_count ?? 0);

    const sample = tableExists
      ? (await client.query<{ evidence_id: string }>(`
          SELECT evidence_id
          FROM atlas_evidence
          WHERE evidence_kind = 'code.structural'
          ORDER BY created_at DESC, evidence_id DESC
          LIMIT 1
        `)).rows[0]
      : undefined;

    let repositoryReadbackStatus: 'NOT_ATTEMPTED' | 'PROVEN' | 'FAILED' = 'NOT_ATTEMPTED';
    let repositoryReadbackChecksum: string | null = null;
    if (sample?.evidence_id) {
      try {
        const evidenceLedger = createEvidenceLedgerRepository(client);
        const receipt = await evidenceLedger.readback({
          evidence_id: sample.evidence_id,
          producer_revision: PRODUCER_REVISION,
        });
        repositoryReadbackStatus = 'PROVEN';
        repositoryReadbackChecksum = receipt.checksum;
      } catch {
        repositoryReadbackStatus = 'FAILED';
      }
    }

    const proof = classifyGraphifyStructuralPersistenceProofV1({
      schema: 'atlas.graphify-structural-persistence-observation.v1',
      tableExists,
      columns,
      sourceRevisionIndexPresent,
      structuralRowCount,
      suspiciousPseudoRevisionCount,
      sampleEvidenceId: sample?.evidence_id ?? null,
      repositoryReadbackStatus,
      repositoryReadbackChecksum,
      revisionOwnerProven: REVISION_OWNER_PROVEN,
      canonicalWriteAttempted: false,
      producerRevision: PRODUCER_REVISION,
    });

    await client.query('ROLLBACK');
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(proof, null, 2));

    // Block only when the storage/readback surface itself is broken or polluted.
    // Revision-owner blocking is an expected proof state and exits zero so GPH-18
    // can establish persistence ownership without pretending canonical writes are ready.
    if (
      proof.status === 'PERSISTENCE_OWNER_NOT_READY'
      || proof.status === 'PERSISTENCE_OWNER_IDENTIFIED_READBACK_FAILED'
      || proof.status === 'PERSISTENCE_OWNER_IDENTIFIED_PSEUDOREVISION_DETECTED'
    ) {
      process.exitCode = 2;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
