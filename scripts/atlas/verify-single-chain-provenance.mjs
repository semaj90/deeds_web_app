import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { resolveDatabaseUrl, loadRepoEnv, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv();
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
const client = await pool.connect();
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://127.0.0.1:6333' });

try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

  // Find a candidate where chunk has 768 vector AND is in ORF AND is in graphify_files
  const cand = await client.query(`
    SELECT
      c.id as chunk_uuid,
      c.chunk_id,
      c.qdrant_id,
      c.source_ref,
      c.embedding_model,
      c.embedding_version,
      o.packet_key,
      o.source_revision,
      o.workspace_revision,
      o.representation_revision,
      o.registry_revision,
      g.code_source_revision,
      g.workspace_revision as g_workspace_revision
    FROM codebase_chunk_index c
    JOIN atlas_observation_feature_rows o ON c.source_ref = o.source_ref
    JOIN graphify_files g ON o.source_ref = g.source_ref OR ('sveltekit-frontend/' || o.source_ref) = g.source_ref
    WHERE c.content_embedding_768 IS NOT NULL
      AND o.source_revision IS NOT NULL
    LIMIT 1;
  `);

  if (!cand.rows.length) {
    console.log('No chunk found with both content_embedding_768 and ORF row.');
    process.exit(0);
  }

  const row = cand.rows[0];
  console.log('Found candidate row:', row);

  const targetFileRelative = row.source_ref;
  const targetDiskPath = path.join(REPO_ROOT, 'sveltekit-frontend', targetFileRelative);
  let diskSha256 = null;
  let fileBytesLength = 0;
  if (fs.existsSync(targetDiskPath)) {
    const bytes = fs.readFileSync(targetDiskPath);
    fileBytesLength = bytes.byteLength;
    diskSha256 = 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
  }

  // Read vector
  const vRes = await client.query(`
    SELECT content_embedding_768 FROM codebase_chunk_index WHERE id = $1;
  `, [row.chunk_uuid]);
  const rawVec = vRes.rows[0]?.content_embedding_768;
  let vectorLength = 0;
  let vectorL2Norm = 0;
  let parsedVec = null;
  if (typeof rawVec === 'string') {
    parsedVec = JSON.parse(rawVec);
  } else if (Array.isArray(rawVec)) {
    parsedVec = rawVec;
  }
  if (parsedVec) {
    vectorLength = parsedVec.length;
    vectorL2Norm = Math.sqrt(parsedVec.reduce((sum, x) => sum + x * x, 0));
  }

  // Qdrant retrieve
  let qdrantPoint = null;
  if (row.qdrant_id) {
    try {
      const qRes = await qdrant.retrieve('codebase_chunks_768_v2', {
        ids: [row.qdrant_id],
        with_payload: true,
        with_vector: false,
      });
      qdrantPoint = qRes[0] ?? null;
    } catch (e) {
      console.log('Qdrant retrieve error:', e.message);
    }
  }

  await client.query('ROLLBACK');

  const chain = {
    schema: 'atlas.single-chain-provenance-verification.v1',
    verifiedAt: new Date().toISOString(),
    chain: {
      step1_sourceContent: { path: targetFileRelative, bytes: fileBytesLength, sha256: diskSha256 },
      step2_sourceRevision: {
        diskMatchesOrf: diskSha256 === row.source_revision,
        diskMatchesGraphify: diskSha256 === row.code_source_revision,
        sourceRevision: row.source_revision
      },
      step3_canonicalChunk: { id: row.chunk_uuid, chunkId: row.chunk_id, qdrantId: row.qdrant_id },
      step4_embeddingRecipe: {
        model: row.embedding_model,
        version: row.embedding_version,
        dim: vectorLength,
        l2Norm: Number(vectorL2Norm.toFixed(6))
      },
      step5_packetKey: row.packet_key,
      step6_orfLineage: {
        sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision,
        representationRevision: row.representation_revision,
        registryRevision: row.registry_revision,
      },
      step7_qdrantIdentity: {
        pointId: row.qdrant_id,
        foundInCollection: Boolean(qdrantPoint),
        payloadSourceRef: qdrantPoint?.payload?.source_ref ?? null
      },
      step8_admittedWorkspaceRevisionKey: row.g_workspace_revision,
    },
    chainIntact: Boolean(
      diskSha256 === row.source_revision &&
      vectorLength === 768 &&
      row.packet_key &&
      row.workspace_revision === row.g_workspace_revision
    ),
    canonicalAuthority: false,
    writesPerformed: false,
  };

  console.log('\n=== VERIFIED COMPLETE PROVENANCE CHAIN ===');
  console.log(JSON.stringify(chain, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Provenance verification failed:', error);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
