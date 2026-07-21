#!/usr/bin/env node
/**
 * Backfill the normalized feature layer from atlas_packets.
 *
 * This script is intentionally bounded and resumable:
 *   - default dry-run
 *   - limit/offset paging
 *   - preserves atlas_packets as canonical truth
 *   - populates feature_* fact tables as normalized projections
 */

import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const isApply = process.argv.includes('--apply');
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry') || !isApply;
const limit = parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? process.env.LIMIT ?? '100', 10);
const offset = parseInt(process.argv.find((arg) => arg.startsWith('--offset='))?.split('=')[1] ?? process.env.OFFSET ?? '0', 10);

function normalizeSourceRef(value) {
  return String(value ?? '')
    .trim()
    .replace(/^local:/i, '')
    .replace(/#L\d+(?:-L?\d+)?$/i, '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '');
}

function humanizeFeatureKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'unknown';
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function toTextArray(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
  if (value && typeof value === 'object') {
    if (Array.isArray(value.items)) return value.items.map((entry) => String(entry)).filter(Boolean);
  }
  return [];
}

function uniq(values) {
  return [...new Set(values.filter((value) => value != null && String(value).length > 0).map((value) => String(value)))];
}

function pickContentHash(row) {
  return row.sha256 ?? row.summary_hash ?? row.content_hash ?? row.packet_id;
}

function inferLanguage(row) {
  const filePath = String(row.file_path ?? row.source_ref ?? '').toLowerCase();
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'javascript';
  if (filePath.endsWith('.py')) return 'python';
  if (filePath.endsWith('.sql')) return 'sql';
  if (filePath.endsWith('.md') || filePath.endsWith('.markdown')) return 'markdown';
  if (filePath.endsWith('.json')) return 'json';
  return row.source_kind ?? 'unknown';
}

function normalizeRow(row) {
  const packetKey = String(row.packet_key ?? '').trim() || null;
  const sourceRef = normalizeSourceRef(row.canonical_source_ref ?? row.source_ref ?? row.source_ref_key ?? row.file_path ?? '');
  const featureKey = String(row.feature_id ?? '').trim() || null;
  const featureLabel = String(row.feature_label ?? '').trim() || (featureKey ? humanizeFeatureKey(featureKey) : '');
  const contentHash = String(pickContentHash(row) ?? '').trim() || null;
  const keywords = uniq([...(toTextArray(row.keywords)), ...(toTextArray(row.bm25_terms))]);
  const identifiers = uniq([
    row.function_symbol,
    row.title_id,
    featureKey,
    featureLabel,
  ]);
  const symbols = uniq([
    row.function_symbol,
    row.title_id ? `${row.title_id}` : null,
  ]);
  const usedConcepts = uniq(toTextArray(row.used_concepts));
  const structuralPath = uniq([
    row.directory_path,
    row.file_path,
  ]);
  const joinMethod = packetKey && sourceRef
    ? (featureKey ? 'exact' : 'inferred')
    : 'unresolved';

  return {
    packetKey,
    sourceRef,
    featureKey,
    featureLabel,
    contentHash,
    keywords,
    identifiers,
    symbols,
    usedConcepts,
    structuralPath,
    language: inferLanguage(row),
    joinMethod,
    domainClass: String(row.domain_class ?? '').trim() || null,
    domainConfidence: typeof row.domain_confidence === 'number' ? row.domain_confidence : null,
    treeNodeId: row.tree_node_id ? String(row.tree_node_id) : null,
    symbolName: row.function_symbol ? String(row.function_symbol) : null,
    pageRank: typeof row.pagerank_score === 'number' ? row.pagerank_score : (typeof row.pagerank === 'number' ? row.pagerank : null),
    somCluster: row.som_cluster ?? row.som_cluster_id ?? null,
    somRow: row.som_row ?? null,
    somCol: row.som_col ?? null,
    kmeansCluster: row.kmeans_cluster ?? row.kmeans_cluster_id ?? null,
    qdrantPointId: row.qdrant_point_id ? String(row.qdrant_point_id) : null,
    summary: row.summary ? String(row.summary) : '',
    titleId: row.title_id ? String(row.title_id) : null,
    filePath: row.file_path ? String(row.file_path) : null,
    role: row.function_symbol ? 'primary' : 'primary',
  };
}

async function fetchBatch(client) {
  const { rows } = await client.query(
    `
    SELECT
      packet_id,
      packet_key,
      packet_ulid,
      feature_id,
      feature_label,
      source_ref,
      canonical_source_ref,
      source_ref_key,
      file_path,
      directory_path,
      function_symbol,
      title_id,
      summary,
      keywords,
      bm25_terms,
      used_concepts,
      domain_class,
      domain_confidence,
      tree_node_id,
      pagerank_score,
      pagerank,
      som_cluster,
      som_row,
      som_col,
      kmeans_cluster,
      kmeans_cluster_id,
      qdrant_point_id,
      sha256,
      summary_hash,
      source_kind,
      COALESCE(sha256, summary_hash, packet_id) AS content_hash,
      extracted_entities,
      metadata
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND COALESCE(source_ref, canonical_source_ref, source_ref_key, file_path) IS NOT NULL
    ORDER BY updated_at DESC NULLS LAST, packet_key
    LIMIT $1 OFFSET $2
    `,
    [limit, offset],
  );

  return rows;
}

async function upsertPacketFeature(client, row) {
  if (!row.featureKey) return;
  await client.query(
    `
    INSERT INTO feature_implementations (
      feature_key,
      feature_name,
      description,
      lane_ids,
      status,
      confidence,
      packet_key,
      source_ref,
      content_hash,
      processing_pass_id,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4::text[], 'active', 1.0, $5, $6, $7, NULL, NOW(), NOW())
    ON CONFLICT (feature_key) DO UPDATE SET
      feature_name = EXCLUDED.feature_name,
      description = COALESCE(feature_implementations.description, EXCLUDED.description),
      packet_key = EXCLUDED.packet_key,
      source_ref = EXCLUDED.source_ref,
      content_hash = EXCLUDED.content_hash,
      updated_at = NOW()
    `,
    [
      row.featureKey,
      row.featureLabel || humanizeFeatureKey(row.featureKey),
      row.summary || null,
      [],
      row.packetKey,
      row.sourceRef,
      row.contentHash,
    ],
  );
}

async function upsertFeatureEdge(client, row) {
  if (!row.featureKey || !row.filePath) return;
  await client.query(
    `
    INSERT INTO feature_file_edges (
      feature_key,
      file_path,
      entry_export,
      role,
      line_start,
      line_end,
      stable_key,
      packet_key,
      source_ref,
      content_hash,
      created_at
    )
    VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, NOW())
    ON CONFLICT (feature_key, file_path, entry_export) DO UPDATE SET
      role = EXCLUDED.role,
      stable_key = EXCLUDED.stable_key,
      packet_key = EXCLUDED.packet_key,
      source_ref = EXCLUDED.source_ref,
      content_hash = EXCLUDED.content_hash
    `,
    [
      row.featureKey,
      row.filePath,
      row.symbolName,
      row.role,
      `${row.featureKey}:${row.filePath}:${row.symbolName ?? ''}`,
      row.packetKey,
      row.sourceRef,
      row.contentHash,
    ],
  );
}

async function upsertLexicalFact(client, row) {
  if (!row.packetKey || !row.sourceRef || !row.contentHash) return;
  await client.query(
    `
    INSERT INTO feature_lexical_facts (
      packet_key,
      source_ref,
      feature_key,
      keywords,
      identifiers,
      symbols,
      imported_modules,
      lexical_summary,
      language,
      content_hash,
      extractor_version,
      processing_pass_id,
      metadata,
      created_at
    )
    VALUES ($1, $2, $3, $4::text[], $5::text[], $6::text[], $7::text[], $8, $9, $10, $11, NULL, $12::jsonb, NOW())
    ON CONFLICT (packet_key, extractor_version, content_hash) DO UPDATE SET
      feature_key = EXCLUDED.feature_key,
      keywords = EXCLUDED.keywords,
      identifiers = EXCLUDED.identifiers,
      symbols = EXCLUDED.symbols,
      imported_modules = EXCLUDED.imported_modules,
      lexical_summary = EXCLUDED.lexical_summary,
      language = EXCLUDED.language,
      metadata = EXCLUDED.metadata
    `,
    [
      row.packetKey,
      row.sourceRef,
      row.featureKey,
      row.keywords,
      row.identifiers,
      row.symbols,
      [],
      row.summary || null,
      row.language,
      row.contentHash,
      'atlas-packets-lexical-v1',
      JSON.stringify({
        source: 'atlas_packets',
        join_method: row.joinMethod,
      }),
    ],
  );
}

async function upsertDomainFact(client, row) {
  if (!row.packetKey || !row.sourceRef || !row.contentHash) return;
  await client.query(
    `
    INSERT INTO feature_domain_facts (
      packet_key,
      source_ref,
      feature_key,
      domain_class,
      domain_confidence,
      domain_probabilities,
      classifier_kind,
      classifier_version,
      model_hash,
      feature_contract_version,
      content_hash,
      processing_pass_id,
      evidence,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6, $7, NULL, $8, $9, NULL, $10::jsonb, NOW())
    ON CONFLICT (packet_key, classifier_version, content_hash) DO UPDATE SET
      feature_key = EXCLUDED.feature_key,
      domain_class = EXCLUDED.domain_class,
      domain_confidence = EXCLUDED.domain_confidence,
      classifier_kind = EXCLUDED.classifier_kind,
      feature_contract_version = EXCLUDED.feature_contract_version,
      evidence = EXCLUDED.evidence
    `,
    [
      row.packetKey,
      row.sourceRef,
      row.featureKey,
      row.domainClass ?? 'unknown',
      row.domainConfidence,
      'legacy-backfill',
      'atlas-packets-domain-class-v1',
      'atlas-packets-domain-v1',
      row.contentHash,
      JSON.stringify({
        source: 'atlas_packets',
        confidence_source: row.domainConfidence == null ? 'unverified' : 'canonical',
      }),
    ],
  );
}

async function upsertStructuralFact(client, row) {
  if (!row.packetKey || !row.sourceRef || !row.contentHash) return;
  const structuralExists = await client.query(
    `
    SELECT 1
    FROM feature_structural_facts
    WHERE packet_key = $1
      AND source_ref = $2
      AND content_hash = $3
      AND COALESCE(feature_key, '') = COALESCE($4, '')
      AND COALESCE(symbol_name, '') = COALESCE($5, '')
    LIMIT 1
    `,
    [row.packetKey, row.sourceRef, row.contentHash, row.featureKey, row.symbolName],
  );
  if (structuralExists.rowCount > 0) return;

  await client.query(
    `
    INSERT INTO feature_structural_facts (
      packet_key,
      source_ref,
      feature_key,
      tree_node_id,
      symbol_name,
      symbol_kind,
      structural_path,
      line_start,
      line_end,
      imports,
      calls,
      exports,
      content_hash,
      parser_version,
      processing_pass_id,
      metadata,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::text[], NULL, NULL, $8::text[], $9::text[], $10::text[], $11, $12, NULL, $13::jsonb, NOW())
    `,
    [
      row.packetKey,
      row.sourceRef,
      row.featureKey,
      row.treeNodeId,
      row.symbolName,
      row.symbolName ? 'function' : 'packet',
      row.structuralPath,
      [],
      [],
      [],
      row.contentHash,
      'tree-sitter-v1',
      JSON.stringify({
        source: 'atlas_packets',
        page_rank: row.pageRank,
        som_cluster: row.somCluster,
        kmeans_cluster: row.kmeansCluster,
      }),
    ],
  );
}

async function upsertOntologyFacts(client, row) {
  if (!row.packetKey || !row.sourceRef || !row.contentHash) return;
  const tuples = [];
  if (row.domainClass) {
    tuples.push({
      subject_type: 'packet',
      subject_id: `packet:${row.packetKey}`,
      predicate: 'CLASSIFIED_AS',
      object_type: 'domain',
      object_id: `domain:${row.domainClass}`,
      object_value: { domain_class: row.domainClass },
      confidence: typeof row.domainConfidence === 'number' ? row.domainConfidence : 1,
    });
  }
  if (row.featureKey) {
    tuples.push({
      subject_type: 'packet',
      subject_id: `packet:${row.packetKey}`,
      predicate: 'IMPLEMENTS_FEATURE',
      object_type: 'feature',
      object_id: `feature:${row.featureKey}`,
      object_value: { feature_key: row.featureKey, feature_label: row.featureLabel },
      confidence: 1,
    });
    if (row.domainClass) {
      tuples.push({
        subject_type: 'feature',
        subject_id: `feature:${row.featureKey}`,
        predicate: 'BELONGS_TO_DOMAIN',
        object_type: 'domain',
        object_id: `domain:${row.domainClass}`,
        object_value: { domain_class: row.domainClass },
        confidence: 1,
      });
    }
  }

  for (const concept of row.usedConcepts) {
    tuples.push({
      subject_type: 'packet',
      subject_id: `packet:${row.packetKey}`,
      predicate: 'USES_CONCEPT',
      object_type: 'concept',
      object_id: `concept:${concept.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      object_value: { concept },
      confidence: 0.7,
    });
  }

  for (const tuple of tuples) {
    await client.query(
      `
      INSERT INTO feature_ontology_tuples (
        packet_key,
        source_ref,
        feature_key,
        subject_type,
        subject_id,
        predicate,
        object_type,
        object_id,
        object_value,
        confidence,
        ontology_version,
        extractor_version,
        processing_pass_id,
        evidence,
        valid_from,
        valid_to,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, NULL, $13::jsonb, NOW(), NULL, NOW())
      ON CONFLICT (packet_key, subject_type, subject_id, predicate, object_type, object_id, ontology_version) DO UPDATE SET
        object_value = EXCLUDED.object_value,
        confidence = EXCLUDED.confidence,
        evidence = EXCLUDED.evidence
      `,
      [
        row.packetKey,
        row.sourceRef,
        row.featureKey,
        tuple.subject_type,
        tuple.subject_id,
        tuple.predicate,
        tuple.object_type,
        tuple.object_id,
        JSON.stringify(tuple.object_value ?? {}),
        tuple.confidence,
        'atlas-ontology-v1',
        'atlas-packets-ontology-v1',
        JSON.stringify({
          source: 'atlas_packets',
          join_method: row.joinMethod,
        }),
      ],
    );
  }
}

async function main() {
  const pool = new Pool({ connectionString: POSTGRES_URL });
  const client = await pool.connect();

  try {
    const rows = await fetchBatch(client);
    const normalized = rows.map(normalizeRow);

    const summary = {
      generated_at: new Date().toISOString(),
      mode: isDryRun ? 'dry-run' : 'apply',
      limit,
      offset,
      rows_selected: rows.length,
      join_methods: {
        exact: normalized.filter((row) => row.joinMethod === 'exact').length,
        inferred: normalized.filter((row) => row.joinMethod === 'inferred').length,
        unresolved: normalized.filter((row) => row.joinMethod === 'unresolved').length,
      },
      feature_key_rows: normalized.filter((row) => row.featureKey).length,
      source_ref_rows: normalized.filter((row) => row.sourceRef).length,
      lexical_candidates: normalized.filter((row) => row.packetKey && row.sourceRef && row.contentHash).length,
      domain_candidates: normalized.filter((row) => row.packetKey && row.sourceRef && row.contentHash).length,
      structural_candidates: normalized.filter((row) => row.packetKey && row.sourceRef && row.contentHash).length,
      ontology_candidates: normalized.filter((row) => row.packetKey && row.sourceRef && row.contentHash).length,
      sample: normalized.slice(0, 5).map((row) => ({
        packet_key: row.packetKey,
        source_ref: row.sourceRef,
        feature_key: row.featureKey,
        join_method: row.joinMethod,
        domain_class: row.domainClass,
      })),
    };

    if (isDryRun) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    await client.query('BEGIN');
    try {
      for (const row of normalized) {
        await upsertPacketFeature(client, row);
        await upsertFeatureEdge(client, row);
        await upsertLexicalFact(client, row);
        await upsertDomainFact(client, row);
        await upsertStructuralFact(client, row);
        await upsertOntologyFacts(client, row);
      }
      await client.query('COMMIT');
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
