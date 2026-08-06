#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

import { extractRepositoryFeatureEvidence } from './lib/extract-repository-feature-evidence.mjs';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = readNumberArg('limit', 500);

const REPO_ROOT = path.resolve(process.env.ATLAS_REPO_ROOT ?? process.cwd());

const pool = new Pool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5434),
  database: process.env.DB_NAME ?? 'legal_ai_db',
  user: process.env.DB_USER ?? 'legal_admin',
  password: process.env.DB_PASSWORD,
});

function readNumberArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));

  if (!raw) return fallback;

  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) ? value : fallback;
}

function resolveSourcePath(sourceRef) {
  if (!sourceRef) return null;

  const normalized = sourceRef.replaceAll('\\', '/');

  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  return path.join(REPO_ROOT, normalized);
}

async function loadExistingSidecar(client, packetKey) {
  const result = await client.query(
    `
      SELECT
        ast_evidence,
        lsp_evidence,
        ontology_evidence,
        ml_evidence
      FROM atlas_feature_evidence
      WHERE packet_key = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [packetKey]
  );

  return result.rows[0] ?? {};
}

async function main() {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `
        SELECT
          packet_key,
          title_id,
          source_ref,
          canonical_source_ref,
          content_hash,
          source_revision
        FROM atlas_packets
        WHERE
          source_ref IS NOT NULL
          AND content_hash IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      [LIMIT]
    );

    let scanned = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of result.rows) {
      const sourceRef = row.canonical_source_ref ?? row.source_ref;

      const filePath = resolveSourcePath(sourceRef);

      if (!filePath) {
        skipped += 1;
        continue;
      }

      try {
        await fs.access(filePath);
      } catch {
        skipped += 1;
        continue;
      }

      scanned += 1;

      try {
        const extracted = await extractRepositoryFeatureEvidence(filePath, { sourceRef });

        const sidecar = await loadExistingSidecar(client, row.packet_key);

        const receipt = {
          schema_version: 'atlas.repository-feature-evidence.v1',

          packet_key: row.packet_key,
          title_id: row.title_id,
          content_hash: row.content_hash,
          source_revision: row.source_revision,
          source_ref: sourceRef,

          language: extracted.language ?? null,
          modality: extracted.modality ?? null,

          ast_evidence: sidecar.ast_evidence ?? extracted.ast_evidence ?? null,

          lsp_evidence: sidecar.lsp_evidence ?? null,

          document_evidence: extracted.document_evidence ?? null,

          ontology_evidence: sidecar.ontology_evidence ?? null,

          ml_evidence: sidecar.ml_evidence ?? null,

          placeholder_findings: extracted.placeholders ?? [],
        };

        if (DRY_RUN) {
          console.log('[feature-evidence:dry]', row.packet_key, sourceRef);
          continue;
        }

        await client.query(
          `
            INSERT INTO atlas_feature_evidence (
              packet_key,
              content_hash,
              source_revision,
              extractor_version,
              source_ref,
              language,
              modality,
              ast_evidence,
              lsp_evidence,
              document_evidence,
              ontology_evidence,
              ml_evidence,
              placeholder_findings,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5,
              $6, $7,
              $8::jsonb,
              $9::jsonb,
              $10::jsonb,
              $11::jsonb,
              $12::jsonb,
              $13::jsonb,
              NOW()
            )
            ON CONFLICT (
              packet_key,
              content_hash,
              extractor_version
            )
            DO UPDATE SET
              source_revision =
                EXCLUDED.source_revision,
              source_ref =
                EXCLUDED.source_ref,
              language =
                EXCLUDED.language,
              modality =
                EXCLUDED.modality,
              ast_evidence =
                EXCLUDED.ast_evidence,
              lsp_evidence =
                EXCLUDED.lsp_evidence,
              document_evidence =
                EXCLUDED.document_evidence,
              ontology_evidence =
                EXCLUDED.ontology_evidence,
              ml_evidence =
                EXCLUDED.ml_evidence,
              placeholder_findings =
                EXCLUDED.placeholder_findings,
              updated_at = NOW()
          `,
          [
            receipt.packet_key,
            receipt.content_hash,
            receipt.source_revision,
            receipt.schema_version,
            receipt.source_ref,
            receipt.language,
            receipt.modality,
            JSON.stringify(receipt.ast_evidence),
            JSON.stringify(receipt.lsp_evidence),
            JSON.stringify(receipt.document_evidence),
            JSON.stringify(receipt.ontology_evidence),
            JSON.stringify(receipt.ml_evidence),
            JSON.stringify(receipt.placeholder_findings),
          ]
        );

        written += 1;
      } catch (error) {
        failed += 1;

        console.error('[feature-evidence:error]', row.packet_key, String(error?.message ?? error));
      }
    }

    console.log(
      JSON.stringify(
        {
          status: failed ? 'PARTIAL' : 'PASS',
          mode: DRY_RUN ? 'dry' : 'apply',
          scanned,
          written,
          skipped,
          failed,
        },
        null,
        2
      )
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[feature-evidence:fatal]', error);
  process.exitCode = 1;
});
