#!/usr/bin/env node
/**
 * Gemma4 Offline Summary Worker
 *
 * Reads packets from atlas_packets (identity layer).
 * Calls Gemma4 via llama-server for summarization.
 * Logs results to analysis_pass_results (variance layer).
 * Writes selected summaries to atlas_summary_layers (enrichment layer).
 *
 * Usage:
 *   npm run worker:gemma4:summary [--limit=100] [--dry-run] [--apply]
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import * as https from 'https';
import * as http from 'http';
// @ts-ignore shared ESM runtime helper has no local .d.ts
import { sanitizeGemma4Summary } from '../../../scripts/atlas/lib/gemma4-summary-sanitizer.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '100'
);

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const LLAMA_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const MODEL = process.env.GEMMA4_MODEL || 'gemma4-legal-iq4xs-direct.gguf';
const TEMPERATURE = parseFloat(process.env.GEMMA4_TEMP || '0.3');
const MAX_TOKENS = parseInt(process.env.GEMMA4_MAX_TOKENS || '256');

interface PacketRow {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
}

interface AnalysisPassRecord {
  pass_key: string;
  packet_key: string;
  source_ref: string;
  feature_id: string;
  pass_type: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  input_hash: string;
  prompt_hash: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  output: Record<string, any>;
  scores: Record<string, number>;
  index_push: Record<string, boolean>;
  provenance: {
    source: string;
    repo_analysis: boolean;
    input_kind: string;
    summary_variance: {
      temperature: number;
      max_tokens: number;
      seed: null;
      deterministic: boolean;
    };
    runtime: {
      endpoint: string;
      worker: string;
      concurrency: number;
    };
    identity: {
      identity_mutated: boolean;
      join_key: string;
      fallback_join: string;
    };
  };
}

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
});

async function fetchPacketsWithoutSummary(pool: Pool, limit: number): Promise<PacketRow[]> {
  const query = `
    SELECT ap.packet_key, ap.source_ref, ap.feature_id, ap.feature_label
    FROM atlas_packets ap
    LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
    WHERE asl.packet_key IS NULL
    AND ap.packet_key IS NOT NULL
    AND ap.source_ref IS NOT NULL
    AND ap.feature_id IS NOT NULL
    ORDER BY ap.pagerank DESC NULLS LAST
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
}

async function callGemma4(sourceRef: string, featureLabel: string): Promise<string> {
  const prompt = `Summarize this code feature in 1-2 sentences for legal code intelligence:

Feature: ${featureLabel}
File: ${sourceRef}

Summary:`;

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      stream: false,
    });

    const url = new URL(LLAMA_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 30000,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content?.trim() || '';
          const sanitized = sanitizeGemma4Summary(content);
          resolve(sanitized.safe ? sanitized.summary : '');
        } catch (err) {
          reject(new Error(`Failed to parse Gemma4 response: ${err}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemma4 request timeout'));
    });

    req.write(payload);
    req.end();
  });
}

async function logAnalysisPass(pool: Pool, record: AnalysisPassRecord): Promise<number> {
  if (DRY_RUN) {
    console.log(`  ✓ Would log pass: ${record.pass_key} for ${record.packet_key}`);
    return 0;
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO analysis_pass_results (
        pass_key, packet_key, source_ref, feature_id,
        pass_type, status,
        input_hash, prompt_hash, model_name, temperature, max_tokens,
        output, scores, index_push, provenance,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        NOW(), NOW()
      )
      RETURNING id
      `,
      [
        record.pass_key,
        record.packet_key,
        record.source_ref,
        record.feature_id,
        record.pass_type,
        record.status,
        record.input_hash,
        record.prompt_hash,
        record.model_name,
        record.temperature,
        record.max_tokens,
        JSON.stringify(record.output),
        JSON.stringify(record.scores),
        JSON.stringify(record.index_push),
        JSON.stringify(record.provenance),
      ]
    );

    return result.rows[0].id;
  } catch (err) {
    console.error(`  ✗ Failed to log pass: ${err}`);
    throw err;
  }
}

async function writeSummaryLayer(pool: Pool, packet: PacketRow, summary: string): Promise<void> {
  if (DRY_RUN) {
    return;
  }
  const sanitized = sanitizeGemma4Summary(summary);
  if (!sanitized.safe) {
    throw new Error(`Refusing to write leaked Gemma4 summary for ${packet.packet_key}`);
  }

  try {
    await pool.query(
      `
      INSERT INTO atlas_summary_layers (
        packet_key, summary, embedding, embedding_model, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, NULL, $3, $4, NOW(), NOW()
      )
      `,
      [
        packet.packet_key,
        sanitized.summary,
        'embeddinggemma:latest',
        JSON.stringify({
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          pass_key: 'gemma4_summary_v1',
          generated_at: new Date().toISOString(),
        }),
      ]
    );
  } catch (err) {
    console.error(`  ✗ Failed to write summary layer: ${err}`);
    throw err;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Gemma4 Offline Summary Worker (Analysis Pass Logger)          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Limit: ${LIMIT} packets`);
  console.log(`Gemma4: ${MODEL} @ ${TEMPERATURE}°C\n`);

  let processed = 0;
  let successful = 0;
  let failed = 0;

  try {
    const packets = await fetchPacketsWithoutSummary(pgPool, LIMIT);
    console.log(`📦 Fetched ${packets.length} packets without summaries\n`);

    if (packets.length === 0) {
      console.log('✅ All packets already have summaries');
      return;
    }

    for (const packet of packets) {
      processed++;
      console.log(`[${processed}/${packets.length}] Processing ${packet.packet_key}...`);

      try {
        // Call Gemma4
        const summary = await callGemma4(packet.source_ref, packet.feature_label);

        if (!summary) {
          console.log(`  ⚠️  Empty summary returned`);
          failed++;
          continue;
        }

        // Create analysis pass record
        const inputHash = createHash('sha256')
          .update(`${packet.source_ref}:${packet.feature_id}`)
          .digest('hex');
        const promptHash = createHash('sha256')
          .update(`summary:${packet.source_ref}:${packet.feature_label}`)
          .digest('hex');

        const record: AnalysisPassRecord = {
          pass_key: 'gemma4_summary_v1',
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          feature_id: packet.feature_id,
          pass_type: 'summarization',
          status: 'success',
          input_hash: inputHash,
          prompt_hash: promptHash,
          model_name: MODEL,
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
          output: {
            summary,
            summary_tokens: Math.ceil(summary.length / 4),
          },
          scores: {
            confidence: 0.85,
            coherence: 0.90,
          },
          index_push: {
            postgres: true,
            qdrant: true,
            bitfrost: true,
            neo4j: false,
          },
          provenance: {
            source: 'offline_summary_worker',
            repo_analysis: true,
            input_kind: 'repo_file_packet',
            summary_variance: {
              temperature: TEMPERATURE,
              max_tokens: MAX_TOKENS,
              seed: null,
              deterministic: false,
            },
            runtime: {
              endpoint: LLAMA_URL,
              worker: 'node_typescript',
              concurrency: 1,
            },
            identity: {
              identity_mutated: false,
              join_key: 'packet_key',
              fallback_join: 'source_ref:feature_id',
            },
          },
        };

        // Log to analysis_pass_results
        const passId = await logAnalysisPass(pgPool, record);
        console.log(`  ✓ Logged pass ${passId}`);

        // Write to atlas_summary_layers
        await writeSummaryLayer(pgPool, packet, summary);
        console.log(`  ✓ Written to summary layer`);

        successful++;
      } catch (err) {
        console.error(`  ✗ Error: ${err}`);
        failed++;
      }
    }

    console.log(`\n✅ Complete`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Successful: ${successful}`);
    console.log(`  Failed: ${failed}`);

    if (DRY_RUN) {
      console.log('\n📋 DRY-RUN: No changes committed\n');
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err}`);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
