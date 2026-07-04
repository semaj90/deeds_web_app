#!/usr/bin/env node
/**
 * Build Summary Envelopes from Code Tuples
 *
 * Goal: Reduce 48K raw files → 500–2K grouped summaries via TurboVec ranking
 *
 * Pattern:
 * 1. Extract tuples (relations, symbols, labels)
 * 2. Group by feature_id, domain_class, source_ref
 * 3. Rank groups by tuple density + relation weight
 * 4. Create summary envelopes (max 2K tuples/group)
 * 5. Queue only top-ranked groups for Gemma4 summarization
 * 6. Output: RabbitMQ jobs for summary worker
 *
 * Output:
 * - .tmp/summary-envelopes.ndjson (grouped, ranked)
 * - .tmp/rabbitmq-gemma4-summary-jobs.ndjson (queued)
 * - docs/reports/summary-envelope-build.json (audit)
 *
 * Usage:
 *   npm run atlas:summary:envelopes:build --dry-run
 *   npm run atlas:summary:envelopes:build --apply
 */

import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || null;

// Config
const TUPLE_LIMIT = 2000; // Max tuples per envelope
const TOP_K_GROUPS = parseInt(process.env.SUMMARY_TOP_K_GROUPS || '500'); // Groups to summarize
const RELATION_WEIGHTS = {
  IMPORTS: 2.0,
  USES_QDRANT: 1.8,
  USES_VECTOR_SEARCH: 1.8,
  DEFINES: 1.5,
  CALLS: 1.3,
  BELONGS_TO_CLUSTER: 1.2,
  SHARES_TAGS: 0.8,
};

const SummaryEnvelopeSchema = z.object({
  feature_id: z.string().min(1),
  title_id: z.string().min(1),
  source_ref: z.string().min(1),
  domain_class: z.string().nullable().optional(),
  feature_label: z.string().nullable().optional(),
  batch_index: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
  score: z.number(),
  tuple_count: z.number().int().nonnegative(),
  symbol_count: z.number().int().nonnegative(),
  top_symbols: z.array(z.string().min(1)).default([]),
  candidate_refs: z.array(z.string().min(1)).default([]),
  has_existing_summary: z.boolean(),
  used_concepts: z.array(z.string().min(1)).default([]),
  lexical_nouns: z.array(z.string().min(1)).default([]),
  lexical_verbs: z.array(z.string().min(1)).default([]),
  lexical_adverbs_ly: z.array(z.string().min(1)).default([]),
  relationship_hints: z.array(z.string().min(1)).default([]),
  routing_hints: z.array(z.string().min(1)).default([]),
  adjacency_packet_keys: z.array(z.string().min(1)).default([]),
  adjacency_feature_ids: z.array(z.string().min(1)).default([]),
  adjacency_source_refs: z.array(z.string().min(1)).default([]),
  packed_arrays: z.object({
    packet_keys: z.array(z.string().min(1)).default([]),
    feature_ids: z.array(z.string().min(1)).default([]),
    source_refs: z.array(z.string().min(1)).default([]),
    title_ids: z.array(z.string().min(1)).default([]),
  }).default({
    packet_keys: [],
    feature_ids: [],
    source_refs: [],
    title_ids: [],
  }),
  columnar_tables: z.array(z.string().min(1)).default([]),
  mmap_vector_refs: z.array(z.string().min(1)).default([]),
  som_cluster: z.union([z.string(), z.number()]).nullable().optional(),
  community_id: z.union([z.string(), z.number()]).nullable().optional(),
  som_row: z.number().int().nonnegative().nullable().optional(),
  som_col: z.number().int().nonnegative().nullable().optional(),
}).strict();

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5434', 10),
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
  user: process.env.POSTGRES_USER ?? 'legal_admin',
  password: process.env.POSTGRES_PASSWORD ?? '123456',
});

async function log(...args) {
  if (!process.env.QUIET) console.log('[summary-envelopes]', ...args);
}

async function readTuples() {
  const query = `
    SELECT
      p.packet_key,
      p.feature_id,
      p.domain_class,
      p.source_ref,
      p.feature_label,
      p.summary,
      p.som_cluster,
      COUNT(*) OVER (PARTITION BY p.feature_id) as tuple_count,
      ROW_NUMBER() OVER (PARTITION BY p.feature_id ORDER BY p.packet_key) as tuple_rank
    FROM atlas_packets p
    WHERE p.feature_id IS NOT NULL
    ORDER BY p.feature_id, p.packet_key
    ${LIMIT ? `LIMIT ${parseInt(LIMIT)}` : ''}
  `;

  const result = await pool.query(query);
  return result.rows;
}

function groupTuples(tuples) {
  const groups = new Map(); // feature_id → {tuples, metadata}

  for (const tuple of tuples) {
    const key = tuple.feature_id;
    if (!groups.has(key)) {
      groups.set(key, {
        feature_id: key,
        source_ref: tuple.source_ref,
        domain_class: tuple.domain_class,
        feature_label: tuple.feature_label,
        tuples: [],
        symbols: new Set(),
        relations: new Set(),
      });
    }

    const group = groups.get(key);
    group.tuples.push({
      packet_key: tuple.packet_key,
      rank: tuple.tuple_rank,
      som_cluster: tuple.som_cluster,
      summary: tuple.summary,
    });

    // Extract symbols from labels
    if (tuple.feature_label) {
      const parts = tuple.feature_label.split(/[._-]/);
      parts.forEach(p => {
        if (p.length > 3) group.symbols.add(p);
      });
    }
  }

  return groups;
}

function humanizeTitleId(value) {
  const text = String(value || '').trim();
  if (!text) return 'summary.packet';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '') || 'summary.packet';
}

function deriveUsedConcepts(group) {
  const values = [
    group.feature_label,
    group.feature_id,
    group.domain_class,
    ...(Array.isArray(group.symbols)
      ? group.symbols
      : group.symbols instanceof Set
        ? Array.from(group.symbols)
        : Array.isArray(group.top_symbols)
          ? group.top_symbols
          : []),
  ];
  return [...new Set(values.map((value) => String(value ?? '').trim().toLowerCase()).filter((value) => value.length >= 3))].slice(0, 40);
}

function deriveTopologyFields(group) {
  const somCluster = group.tuples.find((tuple) => tuple.som_cluster !== null && tuple.som_cluster !== undefined)?.som_cluster ?? null;
  const somText = String(somCluster ?? '').trim();
  const somMatch = somText.match(/^(\d+)\s*[:,-]\s*(\d+)$/);
  return {
    som_cluster: somCluster,
    community_id: null,
    som_row: somMatch ? Number(somMatch[1]) : null,
    som_col: somMatch ? Number(somMatch[2]) : null,
  };
}

function rankGroups(groups) {
  const ranked = [];

  for (const [featureId, group] of groups) {
    // Scoring:
    // - tuple_count: log scale (more tuples = more important)
    // - symbol_diversity: unique symbols in group
    // - som_cluster: group coherence (same cluster = +0.5)
    // - has_summary: existing summary = +0.3

    const tupleScore = Math.log(group.tuples.length + 1) * 0.5;
    const symbolScore = group.symbols.size / 100; // Max ~50 symbols
    const somScore = group.tuples.filter(t => t.som_cluster).length > group.tuples.length * 0.7 ? 0.5 : 0;
    const summaryScore = group.tuples.filter(t => t.summary).length > 0 ? 0.3 : 0;

    const score = tupleScore + symbolScore + somScore + summaryScore;

    ranked.push({
      feature_id: featureId,
      score,
      tuple_count: group.tuples.length,
      symbol_count: group.symbols.size,
      symbols: Array.from(group.symbols),
      has_summary: group.tuples.some(t => t.summary),
      source_ref: group.source_ref,
      domain_class: group.domain_class,
      feature_label: group.feature_label,
      top_symbols: Array.from(group.symbols).slice(0, 5),
      tuples: group.tuples,
    });
  }

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function buildEnvelopes(rankedGroups, topK) {
  const envelopes = [];

  for (let i = 0; i < Math.min(topK, rankedGroups.length); i++) {
    const group = rankedGroups[i];
    const titleId = humanizeTitleId(group.feature_label || group.feature_id);
    const usedConcepts = deriveUsedConcepts(group);
    const topology = deriveTopologyFields(group);

    // Split large groups
    const subgroups = [];
    for (let j = 0; j < group.tuples.length; j += TUPLE_LIMIT) {
      const batch = group.tuples.slice(j, j + TUPLE_LIMIT);
      subgroups.push({
        batch_index: Math.floor(j / TUPLE_LIMIT),
        tuples: batch,
      });
    }

    for (const sub of subgroups) {
      const envelope = {
        feature_id: group.feature_id,
        title_id: titleId,
        batch_index: sub.batch_index,
        source_ref: group.source_ref,
        domain_class: group.domain_class,
        feature_label: group.feature_label,
        rank: i + 1,
        score: group.score,
        tuple_count: sub.tuples.length,
        symbol_count: group.symbol_count ?? (Array.isArray(group.symbols) ? group.symbols.length : 0),
        top_symbols: group.top_symbols,
        candidate_refs: sub.tuples.map(t => t.packet_key),
        has_existing_summary: group.has_summary,
        used_concepts: usedConcepts,
        lexical_nouns: group.top_symbols,
        lexical_verbs: [],
        lexical_adverbs_ly: [],
        relationship_hints: group.tuples.some((t) => t.summary) ? ['SUMMARY_EXISTS'] : [],
        routing_hints: [
          `feature:${group.feature_id}`,
          `title:${titleId}`,
          group.domain_class ? `domain:${group.domain_class}` : null,
        ].filter(Boolean),
        adjacency_packet_keys: sub.tuples.map(t => t.packet_key),
        adjacency_feature_ids: [group.feature_id],
        adjacency_source_refs: [group.source_ref],
        packed_arrays: {
          packet_keys: sub.tuples.map(t => t.packet_key),
          feature_ids: [group.feature_id],
          source_refs: [group.source_ref],
          title_ids: [titleId],
        },
        columnar_tables: ['atlas_packets', 'atlas_feature_envelopes'],
        mmap_vector_refs: [],
        ...topology,
      };
      const validated = SummaryEnvelopeSchema.parse(envelope);
      envelopes.push(validated);
    }
  }

  return envelopes;
}

function buildSummaryJobs(envelopes) {
  const jobs = [];

  for (const envelope of envelopes) {
    jobs.push({
      job_id: `summary-${envelope.feature_id}-${envelope.batch_index}`,
      job_type: 'feature_envelope_summary',
      priority: Math.max(0, 10 - envelope.rank), // Higher rank = lower priority
      group_key: envelope.feature_id,
      source_ref: envelope.source_ref,
      domain_class: envelope.domain_class,
      feature_label: envelope.feature_label,
      batch_index: envelope.batch_index,
      tuple_count: envelope.tuple_count,
      top_symbols: envelope.top_symbols,
      candidate_refs: envelope.candidate_refs,
      max_tokens: 512,
        model: 'gemma4-legal-iq4xs-direct.gguf',
      created_at: new Date().toISOString(),
    });
  }

  return jobs;
}

async function writeOutput(envelopes, jobs) {
  // Ensure output dirs
  fs.mkdirSync('.tmp', { recursive: true });
  fs.mkdirSync('docs/reports', { recursive: true });

  // Write envelopes (NDJSON)
  const envelopeLines = envelopes.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync('.tmp/summary-envelopes.ndjson', envelopeLines + '\n');

  // Write jobs (NDJSON)
  const jobLines = jobs.map(j => JSON.stringify(j)).join('\n');
  fs.writeFileSync('.tmp/rabbitmq-gemma4-summary-jobs.ndjson', jobLines + '\n');

  // Write audit report
  const report = {
    timestamp: new Date().toISOString(),
    dry_run: DRY_RUN,
    total_envelopes: envelopes.length,
    total_jobs: jobs.length,
    tuples_to_summarize: envelopes.reduce((sum, e) => sum + e.tuple_count, 0),
    avg_tuples_per_envelope: envelopes.length > 0 ? Math.round(envelopes.reduce((sum, e) => sum + e.tuple_count, 0) / envelopes.length) : 0,
    top_k_groups: TOP_K_GROUPS,
    tuple_limit_per_group: TUPLE_LIMIT,
    distribution: {
      by_domain_class: {},
      by_rank: { top_10: 0, top_50: 0, top_100: 0, top_500: 0 },
    },
  };

  for (const envelope of envelopes) {
    const cls = envelope.domain_class || 'unknown';
    report.distribution.by_domain_class[cls] = (report.distribution.by_domain_class[cls] ?? 0) + 1;

    if (envelope.rank <= 10) report.distribution.by_rank.top_10++;
    if (envelope.rank <= 50) report.distribution.by_rank.top_50++;
    if (envelope.rank <= 100) report.distribution.by_rank.top_100++;
    if (envelope.rank <= 500) report.distribution.by_rank.top_500++;
  }

  fs.writeFileSync('docs/reports/summary-envelope-build.json', JSON.stringify(report, null, 2) + '\n');

  log('✅ Output written:');
  log(`  - .tmp/summary-envelopes.ndjson (${envelopes.length} envelopes)`);
  log(`  - .tmp/rabbitmq-gemma4-summary-jobs.ndjson (${jobs.length} jobs)`);
  log(`  - docs/reports/summary-envelope-build.json`);
}

async function main() {
  try {
    log('Starting summary envelope build');
    log(`Top-K groups: ${TOP_K_GROUPS}, Tuple limit: ${TUPLE_LIMIT}`);
    log(`Dry-run: ${DRY_RUN}`);
    log('');

    // 1. Read tuples from Postgres
    log('Reading tuples from atlas_packets...');
    const tuples = await readTuples();
    log(`✅ Read ${tuples.length} tuples`);

    // 2. Group by feature_id
    log('Grouping tuples by feature_id...');
    const groups = groupTuples(tuples);
    log(`✅ Created ${groups.size} groups`);

    // 3. Rank groups
    log('Ranking groups by tuple density + diversity...');
    const rankedGroups = rankGroups(groups);
    log(`✅ Ranked ${rankedGroups.length} groups`);

    if (VERBOSE) {
      log('Top 10 groups:');
      rankedGroups.slice(0, 10).forEach((g, i) => {
        log(`  ${i + 1}. ${g.feature_id} (score: ${g.score.toFixed(2)}, tuples: ${g.tuple_count})`);
      });
    }

    // 4. Build envelopes
    log(`Building envelopes for top-${TOP_K_GROUPS} groups...`);
    const envelopes = buildEnvelopes(rankedGroups, TOP_K_GROUPS);
    log(`✅ Created ${envelopes.length} envelopes`);

    // 5. Build RabbitMQ jobs
    log('Building summary jobs for RabbitMQ...');
    const jobs = buildSummaryJobs(envelopes);
    log(`✅ Created ${jobs.length} jobs`);

    // 6. Write output
    log('Writing output files...');
    await writeOutput(envelopes, jobs);

    // 7. Summary
    log('');
    log('📊 Summary Envelope Build Complete:');
    log(`  Total tuples processed: ${tuples.length}`);
    log(`  Groups created: ${groups.size}`);
    log(`  Groups selected: ${envelopes.length}`);
    log(`  Summary jobs queued: ${jobs.length}`);
    log(`  Tuples to summarize: ${envelopes.reduce((sum, e) => sum + e.tuple_count, 0)}`);
    log(`  Estimated time: ${jobs.length * 10}s (10s/job on RTX 3060 Ti)`);
    log('');
    log('🚀 Next steps:');
    log('  1. Review docs/reports/summary-envelope-build.json');
    log('  2. Queue jobs to RabbitMQ: npm run atlas:summary:envelopes:queue:apply');
    log('  3. Monitor: npm run atlas:summary:envelopes:status');

    await pool.end();
  } catch (err) {
    console.error('[summary-envelopes] Fatal error:', err.message);
    process.exit(1);
  }
}

main();
