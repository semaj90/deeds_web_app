#!/usr/bin/env node
/**
 * Backfill derived feature envelopes from atlas_summary_layers into atlas_packets.metadata.
 *
 * This does not create a new truth store. It enriches the canonical Postgres packet row
 * so feature labels, ontology labels, topology labels, and traversal-ready metadata can
 * be mirrored into Qdrant / Redis / Neo4j later.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { buildSummaryContext } from './lib/summary-context-map.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 500);
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'feature-envelope-backfill.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'feature-envelope-backfill.md');
const OUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'feature-envelopes.ndjson');

function isText(value) {
  return String(value ?? '').trim().length > 0;
}

function asArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const normalized = normalizeJson(value[key]);
      if (normalized !== undefined) acc[key] = normalized;
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalizeJson(value));
}

function deriveEnvelope(row) {
  const context = buildSummaryContext(row);
  const metadata = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)) ? row.metadata : {};
  const payload = (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)) ? row.payload : {};
  const summaryContext = (metadata.summary_context && typeof metadata.summary_context === 'object' && !Array.isArray(metadata.summary_context))
    ? metadata.summary_context
    : context;

  const featureId = String(row.feature_id ?? summaryContext.feature_id ?? '').trim();
  const featureLabel = String(row.feature_label ?? summaryContext.feature_label ?? '').trim();
  const sourceRef = String(row.source_ref ?? summaryContext.source_ref ?? '').trim();
  const packetKey = String(row.packet_key ?? '').trim();
  const domainClass = String(row.domain_class ?? summaryContext.domain_class ?? '').trim();
  const ontologyLabel = String(row.ontology_label ?? summaryContext.ontology_label ?? '').trim();
  const topologyLabel = String(row.topology_label ?? summaryContext.topology_label ?? '').trim();

  const aceTags = unique([
    ...asArray(payload.tags),
    ...asArray(metadata.tags),
    domainClass,
    ontologyLabel,
    topologyLabel,
    summaryContext.language,
    'feature-envelope',
  ]);

  const keywords = unique([
    ...asArray(metadata.keywords),
    ...asArray(summaryContext.ontology_tags),
    ...asArray(payload.keywords),
    featureLabel,
    featureId,
  ]);

  const entities = unique([
    ...asArray(row.packet_entities),
    ...asArray(metadata.entities),
    ...asArray(payload.entities),
  ]);

  const kagNodes = unique([
    featureId,
    featureLabel,
    domainClass,
    ontologyLabel,
    topologyLabel,
    ...(summaryContext.cluster_key ? [summaryContext.cluster_key] : []),
  ]);

  const dagEdges = [
    sourceRef && featureId
      ? { from: sourceRef, to: featureId, relation: 'DESCRIBES' }
      : null,
    featureId && domainClass ? { from: featureId, to: domainClass, relation: 'IN_DOMAIN' } : null,
    featureId && ontologyLabel ? { from: featureId, to: ontologyLabel, relation: 'HAS_ONTOLOGY' } : null,
    featureId && topologyLabel ? { from: featureId, to: topologyLabel, relation: 'IN_TOPOLOGY' } : null,
  ].filter(Boolean);

  return {
    packet_key: packetKey,
    summary_packet_key: `${packetKey}:summary`,
    source_ref: sourceRef,
    source_ref_key: String(row.source_ref_key ?? payload.source_ref_key ?? metadata.source_ref_key ?? '').trim() || null,
    feature_id: featureId,
    feature_label: featureLabel,
    domain_class: domainClass,
    ontology_label: ontologyLabel,
    topology_label: topologyLabel,
    ace_tags: aceTags,
    entities,
    keywords,
    kag_nodes: kagNodes,
    dag_edges: dagEdges,
    confidence: Number(row.confidence ?? summaryContext.pagerank ?? 0.5) || 0.5,
    provenance: {
      worker: 'backfill-feature-envelopes',
      generated_at: new Date().toISOString(),
      source: 'atlas_summary_layers',
      summary_packet_key: `${packetKey}:summary`,
    },
  };
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(ENV), max: 1 });
  try {
    const { rows } = await pool.query(`
      select
        s.packet_key,
        s.summary,
        p.source_ref,
        p.source_ref_key,
        p.feature_id,
        p.feature_label,
        p.domain_class,
        coalesce(nullif(trim(p.metadata->>'ontology_label'), ''), nullif(trim(p.payload->>'ontology_label'), ''), nullif(trim(p.topology->>'ontology_label'), ''), nullif(trim(p.metadata->>'ontology'), ''), nullif(trim(p.payload->>'ontology'), '')) as ontology_label,
        coalesce(nullif(trim(p.metadata->>'topology_label'), ''), nullif(trim(p.payload->>'topology_label'), ''), nullif(trim(p.topology->>'topology_label'), ''), nullif(trim(p.topology->>'cluster_key'), ''), nullif(trim(p.topology->>'som_cluster'), '')) as topology_label,
        p.metadata,
        p.payload,
        null::numeric as confidence
      from atlas_summary_layers s
      left join atlas_packets p on p.packet_key = s.packet_key
      order by s.packet_key asc
      limit $1
    `, [LIMIT]);

    const enriched = rows.map(deriveEnvelope);
    const withCore = enriched.filter((row) => isText(row.packet_key) && isText(row.source_ref) && isText(row.feature_id));

    let updatedPackets = 0;
    let updatedSummaries = 0;

    if (APPLY && withCore.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of withCore) {
          const envelopeJson = stableStringify(row);
          const packetUpdate = await client.query(
            `
              update atlas_packets
              set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{feature_envelope}', $2::jsonb, true),
                  updated_at = now()
              where packet_key = $1
            `,
            [row.packet_key, envelopeJson],
          );
          updatedPackets += packetUpdate.rowCount ?? 0;

          const summaryUpdate = await client.query(
            `
              update atlas_summary_layers
              set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{feature_envelope}', $2::jsonb, true),
                  updated_at = now()
              where packet_key = $1
            `,
            [row.packet_key, envelopeJson],
          );
          updatedSummaries += summaryUpdate.rowCount ?? 0;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    await fs.mkdir(path.dirname(OUT_NDJSON), { recursive: true });
    await fs.writeFile(OUT_NDJSON, enriched.map((row) => stableStringify(row)).join('\n') + '\n', 'utf8');

    const report = {
      generated_at: new Date().toISOString(),
      apply: APPLY,
      limit: LIMIT,
      rows_read: rows.length,
      rows_with_core_identity: withCore.length,
      updated_packets: updatedPackets,
      updated_summary_layers: updatedSummaries,
      ndjson: path.relative(REPO_ROOT, OUT_NDJSON).replace(/\\/g, '/'),
      status: APPLY ? 'PASS' : 'DRY_RUN',
      notes: [
        'Feature envelopes are derived from the summary row plus joined packet identity.',
        'The envelope is materialized into atlas_packets.metadata.feature_envelope and mirrored onto atlas_summary_layers.metadata.feature_envelope.',
      ],
    };

    await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Feature Envelope Backfill',
        '',
        `Generated: ${report.generated_at}`,
        `Apply: ${report.apply ? 'yes' : 'no'}`,
        `Status: ${report.status}`,
        '',
        '## Counts',
        '',
        `- rows read: ${report.rows_read}`,
        `- rows with core identity: ${report.rows_with_core_identity}`,
        `- updated atlas_packets: ${report.updated_packets}`,
        `- updated atlas_summary_layers: ${report.updated_summary_layers}`,
        `- ndjson: ${report.ndjson}`,
        '',
      ].join('\n'),
      'utf8',
    );

    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) {
      console.log('Dry run only. Re-run with --apply to write feature envelopes.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
