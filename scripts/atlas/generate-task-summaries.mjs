#!/usr/bin/env node
/**
 * generate-task-summaries.mjs
 *
 * Block 4 — Phase 101.
 *
 * Fetches task_semantic_packets rows that have no summary_llm set,
 * calls Ollama with think:false (Gemma4 rule from CLAUDE.md), and
 * writes the summary back to task_semantic_packets.packet_json / summary_llm.
 *
 * Uses the Ollama /api/chat endpoint directly (not llama-server) since
 * summaries are short and don't need the 65k context window.
 *
 * Usage:
 *   node scripts/atlas/generate-task-summaries.mjs           # dry-run
 *   node scripts/atlas/generate-task-summaries.mjs --commit  # writes to DB
 *   node scripts/atlas/generate-task-summaries.mjs --limit 20
 *   node scripts/atlas/generate-task-summaries.mjs --model gemma4-legal:latest
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const DRY_RUN = !process.argv.includes('--commit');
const args    = process.argv.slice(2);
const getFlag = (name) => {
  const eq  = args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
  if (eq) return eq;
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
};

const LIMIT      = parseInt(getFlag('limit') ?? '10', 10);
const MODEL      = getFlag('model') ?? process.env.OLLAMA_MODEL ?? 'gemma4-legal:latest';
const OLLAMA_RAW = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = OLLAMA_RAW.startsWith('http') ? OLLAMA_RAW : `http://${OLLAMA_RAW}:11434`;
const DB_URL     = process.env.DATABASE_URL;
const TMP_DIR    = resolve(ROOT, '.tmp');
const TODAY      = new Date().toISOString().slice(0, 10);

async function callOllama(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 200 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content?.trim() ?? '';
}

async function main() {
  console.log(`\n[generate-task-summaries] ${DRY_RUN ? 'DRY RUN' : 'COMMIT MODE'}`);
  console.log(`  Model:  ${MODEL}`);
  console.log(`  Ollama: ${OLLAMA_URL}`);
  console.log(`  Limit:  ${LIMIT}\n`);

  if (!DB_URL) {
    console.error('  DATABASE_URL not set — cannot query task_semantic_packets.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DB_URL });
  let client;

  try {
    client = await pool.connect();

    // Fetch rows without a summary
    const { rows } = await client.query(`
      SELECT id, workspace_task_id, feature_id, source_ref, file_path, status, point_kind
      FROM task_semantic_packets
      WHERE (summary_llm IS NULL OR summary_llm = '')
        AND deleted = false
      ORDER BY created_at DESC
      LIMIT $1
    `, [LIMIT]);

    console.log(`  Found ${rows.length} packets needing summaries`);
    if (rows.length === 0) {
      console.log('  All packets already have summaries.');
      await pool.end();
      return;
    }

    // Check Ollama is reachable
    try {
      await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    } catch {
      console.error(`  Ollama not reachable at ${OLLAMA_URL}`);
      if (!DRY_RUN) {
        await pool.end();
        process.exit(1);
      }
      console.log('  (dry-run: continuing without Ollama)\n');
    }

    const results = [];
    let done = 0;

    for (const row of rows) {
      const context = [
        row.feature_id   ? `Feature: ${row.feature_id}` : null,
        row.source_ref   ? `File: ${row.source_ref}` : null,
        row.file_path    ? `Path: ${row.file_path}` : null,
        row.point_kind   ? `Kind: ${row.point_kind}` : null,
        row.status       ? `Status: ${row.status}` : null,
      ].filter(Boolean).join('\n');

      const prompt = `Summarise this codebase task packet in 1-2 sentences for an agent. Be specific about what the file or feature does.\n\n${context}`;

      console.log(`  [${done + 1}/${rows.length}] id=${row.id} ${row.source_ref ?? row.file_path ?? '(no ref)'}`);

      let summary = `[dry-run summary for id=${row.id}]`;

      if (!DRY_RUN) {
        try {
          summary = await callOllama(prompt);
          await client.query(`
            UPDATE task_semantic_packets
            SET summary_llm = $1,
                summary_model = $2,
                updated_at = now()
            WHERE id = $3
          `, [summary, MODEL, row.id]);
          console.log(`    ✓ ${summary.slice(0, 80)}...`);
        } catch (err) {
          console.error(`    ✗ ${err.message}`);
          results.push({ id: row.id, error: err.message });
          done++;
          continue;
        }
      } else {
        console.log(`    [dry-run] would write summary`);
      }

      results.push({ id: row.id, source_ref: row.source_ref, summary: summary.slice(0, 200) });
      done++;
    }

    mkdirSync(TMP_DIR, { recursive: true });
    const outPath = resolve(TMP_DIR, `task-summaries-${TODAY}.json`);
    writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), dryRun: DRY_RUN, model: MODEL, results }, null, 2));

    console.log(`\n  Done: ${done}/${rows.length}`);
    console.log(`  Report: ${outPath}`);
    if (DRY_RUN) console.log('\n  Re-run with --commit to write summaries to DB.');

  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
