#!/usr/bin/env node
/**
 * generate-task-summaries.mjs
 *
 * Uses llama-server.exe / TurboQuant OpenAI-compatible endpoint.
 *
 * Example:
 *   node scripts/atlas/generate-task-summaries.mjs --limit 2
 *   node scripts/atlas/generate-task-summaries.mjs --commit --limit 10 --llama-url http://127.0.0.1:8090/v1 --model gemma4-rotorquant
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

for (const envPath of [
  resolve(ROOT, '.env'),
  resolve(ROOT, '.env.local'),
  resolve(ROOT, 'sveltekit-frontend/.env'),
  resolve(ROOT, 'sveltekit-frontend/.env.local'),
]) {
  dotenv.config({ path: envPath, override: false });
}

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--commit');

function getFlag(name, fallback = null) {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : fallback;
}

function normalizeBaseUrl(raw) {
  const value = String(raw ?? '')
    .trim()
    .replace(/^0\.0\.0\.0/, '127.0.0.1')
    .replace(/\/+$/, '');
  if (!value) return 'http://127.0.0.1:8090/v1';
  if (!value.startsWith('http')) return `http://${value}`;
  return value.endsWith('/v1') ? value : `${value}/v1`;
}

const LIMIT = parseInt(getFlag('limit', '10'), 10);
const MODEL =
  getFlag('model') ??
  process.env.LOCAL_GEMMA_MODEL ??
  process.env.LLAMA_MODEL ??
  'gemma4-rotorquant';

const LLAMA_BASE_URL = normalizeBaseUrl(
  getFlag('llama-url') ??
    process.env.LOCAL_OPENAI_BASE_URL ??
    process.env.LLAMA_SERVER_URL ??
    'http://127.0.0.1:8090/v1'
);

const API_KEY = process.env.LOCAL_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? 'local';

const DB_URL = process.env.DATABASE_URL;
const TMP_DIR = resolve(ROOT, '.tmp');
const TODAY = new Date().toISOString().slice(0, 10);

async function callLlamaServer(prompt) {
  const res = await fetch(`${LLAMA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You summarize codebase task packets for an agent. Return only 1-2 concise sentences. Do not include hidden reasoning, markdown, JSON, or bullet lists.',
        },
        { role: 'user', content: prompt },
      ],
      stream: false,
      temperature: 0.2,
      max_tokens: 200,
      cache_prompt: true,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    throw new Error(`llama-server ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? '').trim();
}

async function checkLlamaServer() {
  const res = await fetch(`${LLAMA_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`llama-server health ${res.status}: ${await res.text()}`);
}

function buildPrompt(row) {
  const context = [
    row.workspace_task_id ? `Task: ${row.workspace_task_id}` : null,
    row.feature_id ? `Feature: ${row.feature_id}` : null,
    row.source_ref ? `Source ref: ${row.source_ref}` : null,
    row.file_path ? `Path: ${row.file_path}` : null,
    row.point_kind ? `Kind: ${row.point_kind}` : null,
    row.status ? `Status: ${row.status}` : null,
    row.packet_json ? `Packet JSON: ${JSON.stringify(row.packet_json).slice(0, 2500)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `Summarize this codebase task packet in 1-2 sentences for an agent. Be specific about what the file, feature, or task is for. Avoid generic wording.\n\n${context}`;
}

async function main() {
  console.log(`\n[generate-task-summaries] ${DRY_RUN ? 'DRY RUN' : 'COMMIT MODE'}`);
  console.log(`  Model:        ${MODEL}`);
  console.log(`  llama-server: ${LLAMA_BASE_URL}`);
  console.log(`  Limit:        ${LIMIT}\n`);

  if (!DB_URL) {
    console.error('  DATABASE_URL not set — cannot query task_semantic_packets.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DB_URL });
  let client;

  try {
    client = await pool.connect();

    const { rows } = await client.query(
      `
      SELECT id, workspace_task_id, feature_id, source_ref, file_path, status, point_kind, packet_json
      FROM task_semantic_packets
      WHERE (summary_llm IS NULL OR summary_llm = '')
        AND deleted = false
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [LIMIT]
    );

    console.log(`  Found ${rows.length} packets needing summaries`);
    if (rows.length === 0) {
      console.log('  All packets already have summaries.');
      return;
    }

    try {
      await checkLlamaServer();
    } catch (err) {
      console.error(`  llama-server not reachable at ${LLAMA_BASE_URL}: ${err.message}`);
      if (!DRY_RUN) process.exit(1);
      console.log('  (dry-run: continuing without llama-server)\n');
    }

    const results = [];
    let done = 0;

    for (const row of rows) {
      const label = row.source_ref ?? row.file_path ?? row.workspace_task_id ?? '(no ref)';
      console.log(`  [${done + 1}/${rows.length}] id=${row.id} ${label}`);

      let summary = `[dry-run summary for id=${row.id}]`;

      if (!DRY_RUN) {
        try {
          summary = await callLlamaServer(buildPrompt(row));

          await client.query(
            `
            UPDATE task_semantic_packets
            SET summary_llm = $1,
                summary_model = $2,
                updated_at = now()
            WHERE id = $3
            `,
            [summary, MODEL, row.id]
          );

          console.log(`    ✓ ${summary.slice(0, 100)}${summary.length > 100 ? '...' : ''}`);
        } catch (err) {
          console.error(`    ✗ ${err.message}`);
          results.push({ id: row.id, source_ref: row.source_ref, error: err.message });
          done++;
          continue;
        }
      } else {
        console.log('    [dry-run] would write summary');
      }

      results.push({
        id: row.id,
        workspace_task_id: row.workspace_task_id,
        source_ref: row.source_ref,
        model: MODEL,
        summary: summary.slice(0, 300),
      });
      done++;
    }

    mkdirSync(TMP_DIR, { recursive: true });
    const outPath = resolve(TMP_DIR, `task-summaries-${TODAY}.json`);
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          dryRun: DRY_RUN,
          model: MODEL,
          llamaBaseUrl: LLAMA_BASE_URL,
          results,
        },
        null,
        2
      )
    );

    console.log(`\n  Done: ${done}/${rows.length}`);
    console.log(`  Report: ${outPath}`);
    if (DRY_RUN) console.log('\n  Re-run with --commit to write summaries to DB.');
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
