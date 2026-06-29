#!/usr/bin/env node

/**
 * Analysis Pass Orchestrator
 *
 * Purpose: Import Gemma4 summaries into analysis_pass_results table
 * and project them into atlas_summary_layers for retrieval.
 *
 * Pipeline:
 *   1. Read .tmp/gemma4-summaries.ndjson (Gemma4 offline worker output)
 *   2. Insert into analysis_pass_results (Postgres — provenance envelope)
 *   3. Project successful rows into atlas_summary_layers
 *   4. Push to BitFrost cache (Redis)
 *   5. Log coverage stats
 *
 * Usage:
 *   npm run analysis:pass:import -- --apply
 *   npm run analysis:pass:import -- --dry-run
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Parse CLI arguments
const isDryRun = !process.argv.includes('--apply');
const inputFile = path.join(ROOT, '.tmp/gemma4-summaries.ndjson');

// ════════════════════════════════════════════════════════════════════════════════
// NDJSON PARSER
// ════════════════════════════════════════════════════════════════════════════════

interface GemmaResult {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  summary: string;
  tags?: string[];
  model: string;
  temperature: number;
  timestamp: string;
}

interface AnalysisPass {
  pass_key: string;
  packet_key: string;
  source_ref: string;
  feature_id: string;
  pass_type: string;
  status: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  output: Record<string, unknown>;
  provenance: Record<string, unknown>;
  index_push: Record<string, boolean>;
}

async function readNdjson(filePath: string): Promise<GemmaResult[]> {
  const results: GemmaResult[] = [];

  if (!fs.existsSync(filePath)) {
    console.warn(`[Analysis Pass] ⚠️  ${filePath} not found`);
    return results;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line) as GemmaResult;
      results.push(parsed);
    } catch (err) {
      console.warn(`[Analysis Pass] ⚠️  Line ${lineNum} JSON parse error, skipping`);
    }
  }

  return results;
}

// ════════════════════════════════════════════════════════════════════════════════
// SQL GENERATION
// ════════════════════════════════════════════════════════════════════════════════

function generateInsertSQL(passes: AnalysisPass[]): string {
  if (passes.length === 0) return '';

  const values = passes
    .map((p, idx) => {
      const idx_placeholder = idx + 1;
      return `(
        '${p.pass_key}',
        '${p.packet_key}',
        '${p.source_ref.replace(/'/g, "''")}',
        '${p.feature_id.replace(/'/g, "''")}',
        '${p.pass_type}',
        '${p.status}',
        NULL,
        NULL,
        '${p.model_name}',
        ${p.temperature},
        ${p.max_tokens},
        '${JSON.stringify(p.output).replace(/'/g, "''")}',
        '{}',
        '${JSON.stringify(p.index_push).replace(/'/g, "''")}',
        '${JSON.stringify(p.provenance).replace(/'/g, "''")}'
      )`;
    })
    .join(',\n');

  return `
INSERT INTO analysis_pass_results (
  pass_key, packet_key, source_ref, feature_id, pass_type, status,
  input_hash, prompt_hash, model_name, temperature, max_tokens,
  output, scores, index_push, provenance
)
VALUES
${values}
ON CONFLICT (id) DO NOTHING;
`;
}

function generateProjectionSQL(): string {
  return `
INSERT INTO atlas_summary_layers (
  packet_key, layer_type, summary_level, summary, summary_text,
  source_ref, feature_id, metadata, provenance, model_name, generated_at
)
SELECT
  apr.packet_key,
  'gemma4_offline',
  'packet',
  apr.output->>'summary',
  apr.output->>'summary',
  apr.source_ref,
  apr.feature_id,
  jsonb_build_object('analysis_pass_id', apr.id, 'pass_key', apr.pass_key),
  apr.provenance,
  apr.model_name,
  apr.created_at
FROM analysis_pass_results apr
WHERE apr.pass_key = 'gemma4_summary_v1'
  AND apr.status = 'success'
  AND apr.output ? 'summary'
ON CONFLICT (packet_key, COALESCE(layer_type, summary_level))
DO UPDATE SET
  summary = EXCLUDED.summary,
  summary_text = EXCLUDED.summary_text,
  metadata = atlas_summary_layers.metadata || EXCLUDED.metadata,
  provenance = atlas_summary_layers.provenance || EXCLUDED.provenance,
  updated_at = now();
`;
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ════════════════════════════════════════════════════════════════════════════════

async function orchestrateAnalysisPass() {
  console.log('[Analysis Pass] Starting import orchestration...');
  console.log(`[Analysis Pass] Input: ${inputFile}`);
  console.log(`[Analysis Pass] Dry-run: ${isDryRun}`);

  try {
    // 1. Read NDJSON
    console.log('[Analysis Pass] Reading Gemma4 results...');
    const results = await readNdjson(inputFile);

    if (results.length === 0) {
      console.warn('[Analysis Pass] ⚠️  No results to import');
      return;
    }

    console.log(`[Analysis Pass] ✅ Read ${results.length} results from ${path.basename(inputFile)}`);

    // 2. Transform to analysis_pass_results format
    const passes: AnalysisPass[] = results.map((r) => ({
      pass_key: 'gemma4_summary_v1',
      packet_key: r.packet_key,
      source_ref: r.source_ref,
      feature_id: r.feature_id,
      pass_type: 'summary',
      status: 'success',
      model_name: r.model,
      temperature: r.temperature,
      max_tokens: 128,
      output: {
        summary: r.summary,
        tags: r.tags || []
      },
      provenance: {
        source: 'offline_summary_worker',
        input_kind: 'repo_file_packet',
        timestamp: r.timestamp,
        summary_variance: {
          temperature: r.temperature,
          max_tokens: 128,
          deterministic: false
        }
      },
      index_push: {
        postgres: true,
        qdrant: false,
        bitfrost: true,
        neo4j: false
      }
    }));

    console.log(`[Analysis Pass] 📊 Transformed ${passes.length} passes for import`);

    // 3. Generate SQL
    const insertSQL = generateInsertSQL(passes);
    const projectionSQL = generateProjectionSQL();

    if (isDryRun) {
      console.log('[Analysis Pass] [DRY] Insert SQL (first 500 chars):');
      console.log(insertSQL.substring(0, 500) + '...\n');
      console.log('[Analysis Pass] [DRY] Projection SQL (first 300 chars):');
      console.log(projectionSQL.substring(0, 300) + '...\n');
      console.log('[Analysis Pass] ✅ Dry-run complete');
      return;
    }

    // 4. Execute SQL via docker exec
    console.log('[Analysis Pass] Executing INSERT...');
    const tempSqlFile = path.join(ROOT, '.tmp/analysis-pass-import.sql');
    fs.writeFileSync(tempSqlFile, insertSQL);

    try {
      await execAsync(
        `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempSqlFile}`,
        { timeout: 30000 }
      );
      console.log('[Analysis Pass] ✅ INSERT complete');
    } catch (err) {
      console.error('[Analysis Pass] ❌ INSERT failed:', (err as Error).message);
      return;
    }

    // 5. Execute projection
    console.log('[Analysis Pass] Executing PROJECTION...');
    const projSqlFile = path.join(ROOT, '.tmp/analysis-pass-projection.sql');
    fs.writeFileSync(projSqlFile, projectionSQL);

    try {
      await execAsync(
        `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${projSqlFile}`,
        { timeout: 30000 }
      );
      console.log('[Analysis Pass] ✅ PROJECTION complete');
    } catch (err) {
      console.error('[Analysis Pass] ❌ PROJECTION failed:', (err as Error).message);
      return;
    }

    // 6. Verify
    console.log('[Analysis Pass] Verifying...');
    const { stdout } = await execAsync(
      'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c ' +
      '"SELECT COUNT(*) as pass_rows, ' +
      'COUNT(*) FILTER (WHERE pass_key=\'gemma4_summary_v1\') as gemma4_rows, ' +
      'COUNT(*) FILTER (WHERE status=\'success\') as success_rows FROM analysis_pass_results;"'
    );

    console.log('[Analysis Pass] 📊 Verification:');
    console.log(stdout);

    console.log('[Analysis Pass] ✅ Import orchestration complete');

    // Cleanup
    fs.rmSync(tempSqlFile, { force: true });
    fs.rmSync(projSqlFile, { force: true });

  } catch (err) {
    console.error('[Analysis Pass] Error:', (err as Error).message);
    process.exit(1);
  }
}

orchestrateAnalysisPass();
