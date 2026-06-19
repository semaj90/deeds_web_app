#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const APPLY = process.argv.includes('--apply');
const SOURCE = path.join(REPO_ROOT, 'docs', 'reports', 'artifact-tiering-application.md');
const FILER_BASE = (process.env.SEAWEED_FILER_URL ?? 'http://127.0.0.1:8888').replace(/\/$/, '');
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'cold-storage-restore-proof.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'cold-storage-restore-proof.md');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  const content = await fs.readFile(SOURCE);
  const hash = sha256(content);
  const objectPath = `/atlas-cold/proofs/${hash}.md`;
  const objectUrl = `${FILER_BASE}${objectPath}`;
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });

  let packet = null;
  try {
    const { rows } = await pool.query(`
      SELECT packet_key, source_ref, feature_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND source_ref IS NOT NULL
        AND feature_id IS NOT NULL
        AND source_ref LIKE '%/%'
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    `);
    packet = rows[0] ?? null;
    if (!packet) throw new Error('No canonical atlas_packets row available for restore proof');

    const report = {
      schema: 'cold_storage_restore_proof.v1',
      generated_at: new Date().toISOString(),
      mode: APPLY ? 'APPLY' : 'DRY_RUN',
      source_path: path.relative(REPO_ROOT, SOURCE).replace(/\\/g, '/'),
      source_hash: hash,
      source_size_bytes: content.length,
      object_path: objectPath,
      packet,
      upload: null,
      restore: null,
      manifest: null,
      status: APPLY ? 'PENDING' : 'DRY_RUN_READY',
    };

    if (APPLY) {
      const form = new FormData();
      form.append('file', new Blob([content], { type: 'text/markdown' }), path.basename(objectPath));
      const uploadResponse = await fetch(objectUrl, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      const uploadText = await uploadResponse.text();
      report.upload = {
        ok: uploadResponse.ok,
        status: uploadResponse.status,
        response: uploadText.slice(0, 1000),
      };
      if (!uploadResponse.ok) throw new Error(`SeaweedFS upload failed: HTTP ${uploadResponse.status} ${uploadText}`);

      const restoreResponse = await fetch(objectUrl, { signal: AbortSignal.timeout(30_000) });
      const restored = Buffer.from(await restoreResponse.arrayBuffer());
      const restoredHash = sha256(restored);
      report.restore = {
        ok: restoreResponse.ok && restoredHash === hash,
        status: restoreResponse.status,
        restored_size_bytes: restored.length,
        restored_hash: restoredHash,
        hash_matches: restoredHash === hash,
      };
      if (!report.restore.ok) throw new Error('SeaweedFS restore hash mismatch');

      const coldObjectKey = `proof:${hash}`;
      const restoreManifest = {
        schema: 'cold_restore_manifest.v1',
        source_path: report.source_path,
        object_url: objectUrl,
        expected_hash: hash,
        restore_command: `curl.exe -fsS "${objectUrl}"`,
        verified_at: report.generated_at,
      };
      const { rows } = await pool.query(`
        INSERT INTO atlas_cold_storage_manifest (
          cold_object_key,
          cold_object_hash,
          source_ref,
          feature_id,
          packet_key,
          archived_content_type,
          archived_size_bytes,
          compressed_size_bytes,
          seaweedfs_path,
          restore_manifest,
          required_for_restore,
          ttl_days,
          expires_at,
          accessed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $7, $8, $9::jsonb, true, 2555,
          now() + interval '2555 days', now()
        )
        ON CONFLICT (cold_object_key) DO UPDATE SET
          cold_object_hash = EXCLUDED.cold_object_hash,
          source_ref = EXCLUDED.source_ref,
          feature_id = EXCLUDED.feature_id,
          packet_key = EXCLUDED.packet_key,
          archived_size_bytes = EXCLUDED.archived_size_bytes,
          compressed_size_bytes = EXCLUDED.compressed_size_bytes,
          seaweedfs_path = EXCLUDED.seaweedfs_path,
          restore_manifest = EXCLUDED.restore_manifest,
          accessed_at = now(),
          updated_at = now()
        RETURNING id, cold_object_key, packet_key, source_ref, feature_id, seaweedfs_path
      `, [
        coldObjectKey,
        hash,
        packet.source_ref,
        packet.feature_id,
        packet.packet_key,
        'text/markdown',
        content.length,
        objectPath,
        JSON.stringify(restoreManifest),
      ]);
      report.manifest = rows[0] ?? null;
      report.status = 'PASS';
    }

    await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
    await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(
      OUT_MD,
      [
        '# Cold Storage Restore Proof',
        '',
        `Generated: ${report.generated_at}`,
        `Status: ${report.status}`,
        '',
        `- source: \`${report.source_path}\``,
        `- object: \`${report.object_path}\``,
        `- packet_key: \`${packet.packet_key}\``,
        `- source_ref: \`${packet.source_ref}\``,
        `- feature_id: \`${packet.feature_id}\``,
        `- source hash: \`${hash}\``,
        `- restored hash: \`${report.restore?.restored_hash ?? 'not-run'}\``,
        `- hash match: ${report.restore?.hash_matches ?? false}`,
        '',
      ].join('\n'),
      'utf8',
    );
    console.log(JSON.stringify({ status: report.status, objectPath, packet, restore: report.restore }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
