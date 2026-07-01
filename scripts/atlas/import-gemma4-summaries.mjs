#!/usr/bin/env node

/**
 * Import Gemma4 Summaries
 *
 * Imports generated summaries from Python offline worker into atlas_summary_layers.
 *
 * Usage:
 *   node scripts/atlas/import-gemma4-summaries.mjs --input=.tmp/gemma4-summaries.ndjson --dry-run
 *   node scripts/atlas/import-gemma4-summaries.mjs --input=.tmp/gemma4-summaries.ndjson --apply
 */

import { Pool } from 'pg';
import fs from 'fs';
import readline from 'readline';
import process from 'process';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { hasGemma4ReasoningLeak, isUsableGemma4Summary, sanitizeGemma4Summary } from './lib/gemma4-summary-sanitizer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'import-gemma4-summaries.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'import-gemma4-summaries.md');
const SUMMARY_PACKET_NDJSON = path.join(REPO_ROOT, '.tmp', 'gemma4-summary-packets.ndjson');

const args = {
  input: process.argv.find(a => a.startsWith('--input='))?.split('=')[1] || '.tmp/gemma4-summaries.ndjson',
  dryRun: process.argv.includes('--dry-run'),
  apply: process.argv.includes('--apply'),
  outputPackets: process.argv.find(a => a.startsWith('--output-packets='))?.split('=')[1] || SUMMARY_PACKET_NDJSON,
};

if (!args.dryRun && !args.apply) {
  console.log(`\n⚠️  Mode not specified. Use --dry-run or --apply\n`);
  process.exit(1);
}

console.log(`\n📥 Import Gemma4 Summaries`);
console.log(`${'='.repeat(50)}`);
console.log(`  Input:   ${args.input}`);
console.log(`  Mode:    ${args.dryRun ? 'DRY-RUN' : 'APPLY'}\n`);

function resolveInputFiles(input) {
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) return [];
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) return [resolved];
  return fs.readdirSync(resolved)
    .filter((name) => /^parent-atlas-gemma4-summaries-shard.*\.ndjson$/i.test(name) || /gemma4.*summar.*\.ndjson$/i.test(name))
    .sort()
    .map((name) => path.join(resolved, name));
}

const inputFiles = resolveInputFiles(args.input);
if (inputFiles.length === 0) {
  console.error(`✗ Input file or summary directory not found: ${args.input}`);
  process.exit(1);
}

const env = loadRepoEnv();

const pool = new Pool({
  connectionString: resolveDatabaseUrl(env),
});

function normalizeText(value) {
  return String(value ?? '').trim();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function hasThoughtLeak(summary) {
  return hasGemma4ReasoningLeak(summary);
}

function isUsableSummary(summary) {
  return isUsableGemma4Summary(summary);
}

function packetKeyFor(obj) {
  return normalizeText(obj.packet_key ?? obj.packetKey ?? obj.packet_id ?? obj.id);
}

function sourceRefFor(obj) {
  return normalizeText(obj.source_ref ?? obj.sourceRef ?? obj.canonical_source_ref ?? obj.canonicalSourceRef ?? obj.file_path ?? obj.source_path);
}

function summaryFor(obj) {
  const sanitized = sanitizeGemma4Summary(obj.summary ?? obj.summary_text ?? obj.text);
  return normalizeText(sanitized.summary);
}

function featureIdFor(obj) {
  return normalizeText(obj.feature_id ?? obj.featureId ?? obj.metadata?.feature_id ?? obj.metadata?.featureId) || null;
}

function buildMetadata(obj, summaryHash) {
  return {
    ...(obj.metadata && typeof obj.metadata === 'object' && !Array.isArray(obj.metadata) ? obj.metadata : {}),
    summary_hash: summaryHash,
    source: 'google-colab',
    worker: 'import-gemma4-summaries',
    colab_shard_index: obj.shard_index ?? obj.shardIndex ?? null,
    colab_shard_count: obj.shard_count ?? obj.shardCount ?? null,
    summary_packet_key: obj.summary_packet_key ?? obj.summaryPacketKey ?? `summary:${packetKeyFor(obj)}:${summaryHash.slice(0, 12)}`,
    imported_at: new Date().toISOString(),
  };
}

async function existingSummary(client, packetKey, summaryHash, summary) {
  const result = await client.query(
    `
      select 1
      from atlas_summary_layers
      where packet_key = $1
        and (
          metadata->>'summary_hash' = $2
          or coalesce(summary, summary_text, '') = $3
        )
      limit 1
    `,
    [packetKey, summaryHash, summary],
  );
  return result.rowCount > 0;
}

async function processInputFile(filePath, summariesToInsert, summaryPackets, stats) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  console.log(`🔍 Reading NDJSON: ${filePath}\n`);

  for await (const line of rl) {
    stats.lines++;

    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line);
      const packet_key = packetKeyFor(obj);
      const source_ref = sourceRefFor(obj);
      const summary = summaryFor(obj);
      const status = normalizeText(obj.status).toLowerCase();

      if (status && !['success', 'ok', 'complete', 'completed'].includes(status)) {
        if (args.dryRun) {
          console.log(`  ⚠️  Line ${stats.lines}: ${packet_key || '<missing packet_key>'} (status=${status})`);
        }
        stats.skippedStatus++;
        continue;
      }

      if (!packet_key || !source_ref || !isUsableSummary(summary)) {
        stats.rejected++;
        if (args.dryRun && stats.rejected <= 5) {
          console.log(`  ⚠️  Line ${stats.lines}: rejected incomplete/leaky summary for ${packet_key || '<missing packet_key>'}`);
        }
        continue;
      }

      const summaryHash = normalizeText(obj.summary_hash ?? obj.summaryHash) || stableHash(summary);
      const metadata = buildMetadata(obj, summaryHash);
      const summaryPacketKey = metadata.summary_packet_key;

      const row = {
        packet_key,
        source_ref,
        source_ref_key: normalizeText(obj.source_ref_key ?? obj.sourceRefKey) || null,
        feature_id: featureIdFor(obj),
        summary,
        layer_type: 'gemma4_offline',
        model_name: 'gemma4-legal-iq4xs-direct.gguf',
        summary_level: 'packet',
        metadata,
      };
      summariesToInsert.push(row);
      summaryPackets.push({
        packet_key,
        summary_packet_key: summaryPacketKey,
        source_ref,
        source_ref_key: row.source_ref_key,
        feature_id: row.feature_id,
        feature_label: obj.feature_label ?? obj.featureLabel ?? obj.metadata?.feature_label ?? null,
        domain_class: obj.domain_class ?? obj.domainClass ?? obj.metadata?.domain_class ?? null,
        ontology_label: obj.ontology_label ?? obj.ontologyLabel ?? obj.metadata?.ontology_label ?? null,
        topology_label: obj.topology_label ?? obj.topologyLabel ?? obj.metadata?.topology_label ?? null,
        summary,
        summary_hash: summaryHash,
        provenance: metadata,
      });

      if (args.dryRun && stats.accepted < 5) {
        console.log(`  ✓ Line ${stats.lines}: ${packet_key}`);
        console.log(`    Summary: ${summary.substring(0, 60)}...`);
      }

      stats.accepted++;
    } catch (err) {
      console.error(`  ✗ Parse error on line ${stats.lines}: ${err.message}`);
      stats.parseErrors++;
    }
  }
}

async function processFile() {
  const summariesToInsert = [];
  const summaryPackets = [];
  const stats = {
    lines: 0,
    accepted: 0,
    parseErrors: 0,
    rejected: 0,
    skippedStatus: 0,
    inserted: 0,
    skippedDuplicates: 0,
  };

  for (const filePath of inputFiles) {
    await processInputFile(filePath, summariesToInsert, summaryPackets, stats);
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Processed: ${stats.lines} lines`);
  console.log(`  Accepted:  ${stats.accepted}`);
  console.log(`  Rejected:  ${stats.rejected}`);
  console.log(`  Status skip: ${stats.skippedStatus}`);
  console.log(`  Parse errors: ${stats.parseErrors}`);

  if (args.dryRun) {
    writeReports(stats, summariesToInsert, summaryPackets, 0);
    console.log(`\n✅ Dry-run complete. Ready to apply with: --apply`);
    process.exit(0);
  }

  // Apply mode: insert into Postgres
  console.log(`\n💾 Inserting into atlas_summary_layers...\n`);

  const client = await pool.connect();
  try {
    for (const row of summariesToInsert) {
      const summaryHash = row.metadata.summary_hash;
      if (await existingSummary(client, row.packet_key, summaryHash, row.summary)) {
        stats.skippedDuplicates++;
        continue;
      }

      await client.query(
        `
      INSERT INTO atlas_summary_layers (
        packet_key,
        source_ref,
        source_ref_key,
        feature_id,
        summary,
        summary_text,
        layer_type,
        model_name,
        summary_level,
        metadata,
        generated_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9::jsonb, now(), now(), now())
        `,
        [
          row.packet_key,
          row.source_ref,
          row.source_ref_key,
          row.feature_id,
          row.summary,
          row.layer_type,
          row.model_name,
          row.summary_level,
          JSON.stringify(row.metadata),
        ],
      );
      stats.inserted++;
      if (stats.inserted % 100 === 0) {
        console.log(`  ✓ Inserted ${stats.inserted}/${summariesToInsert.length}`);
      }
    }
  } finally {
    client.release();
  }

  writeSummaryPackets(summaryPackets);
  writeReports(stats, summariesToInsert, summaryPackets, stats.inserted);

  console.log(`\n✅ Import complete:`);
  console.log(`  Inserted: ${stats.inserted} summaries`);
  console.log(`  Duplicate skips: ${stats.skippedDuplicates}`);
  console.log(`  Summary packet export: ${args.outputPackets}`);
}

function writeSummaryPackets(summaryPackets) {
  fs.mkdirSync(path.dirname(args.outputPackets), { recursive: true });
  fs.writeFileSync(
    args.outputPackets,
    summaryPackets.map((row) => JSON.stringify(row)).join('\n') + (summaryPackets.length ? '\n' : ''),
    'utf8',
  );
}

function writeReports(stats, summariesToInsert, summaryPackets, insertedRows) {
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'apply',
    input: args.input,
    input_files: inputFiles,
    output_packets: args.outputPackets,
    stats,
    candidate_rows: summariesToInsert.length,
    summary_packet_rows: summaryPackets.length,
    inserted_rows: insertedRows,
    sample: summaryPackets.slice(0, 5).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      summary_packet_key: row.summary_packet_key,
      summary_length: row.summary.length,
    })),
    next_steps: [
      'Run the EmbeddingGemma batch worker over atlas_summary_layers rows without embeddings.',
      'Mirror canonical feature/source metadata to Qdrant payloads.',
      'Warm Redis/BitFrost semantic cache from packet and summary rows.',
      'Materialize chrom97 summary packets from .tmp/gemma4-summary-packets.ndjson.',
    ],
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# Import Gemma4 Summaries',
      '',
      `Generated: ${report.generated_at}`,
      `Mode: ${report.mode}`,
      `Input: \`${args.input}\``,
      `Accepted rows: ${stats.accepted}`,
      `Inserted rows: ${insertedRows}`,
      `Duplicate skips: ${stats.skippedDuplicates}`,
      `Rejected rows: ${stats.rejected}`,
      `Status skips: ${stats.skippedStatus}`,
      `Parse errors: ${stats.parseErrors}`,
      `Summary packet export: \`${path.relative(REPO_ROOT, args.outputPackets).replace(/\\/g, '/')}\``,
      '',
      '## Sample',
      '',
      ...report.sample.map((row) => `- ${row.packet_key} | ${row.feature_id ?? 'null'} | ${row.summary_length} chars`),
      '',
      '## Next Steps',
      '',
      ...report.next_steps.map((step) => `- ${step}`),
    ].join('\n'),
    'utf8',
  );
}

try {
  await processFile();
  process.exit(0);
} catch (err) {
  console.error(`✗ Error: ${err.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
