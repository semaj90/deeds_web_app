#!/usr/bin/env node
/**
 * scripts/atlas/gemma4-enrichment-worker.mjs
 *
 * Fetches LangExtract entities from `parent_atlas_documents.payload`,
 * prompts Gemma4 to generate a summary based strictly on those facts,
 * and writes the summary to Postgres under `derived_enrichment.summary`.
 *
 * Usage:
 *   node scripts/atlas/gemma4-enrichment-worker.mjs
 *   node scripts/atlas/gemma4-enrichment-worker.mjs --limit=10
 *   node scripts/atlas/gemma4-enrichment-worker.mjs --dry-run
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { llamaChat } from './lib/llama-inference.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const limitArg = argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const VERBOSE = argv.includes('--verbose');

function loadEnv() {
  const env = { ...process.env };
  const envPaths = [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return env;
}

const ENV = loadEnv();
const DATABASE_URL = ENV.DATABASE_URL ||
  `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

async function callGemma4(factsText, sourceRef) {
  const prompt =
    `You are a SvelteKit/Drizzle codebase analyst. Write a concise 2-sentence summary ` +
    `of what this source file does, based ONLY on the following facts:\n\n` +
    `File: ${sourceRef}\n\nFacts:\n${factsText}\n\nSummary:`;
  const summary = await llamaChat(prompt, { maxTokens: 600, temperature: 0.1 });
  return { summary, backend: 'llama-server' };
}

function sanitizeZeroHiddenThoughts(text) {
  if (!text) return '';
  let cleaned = text;
  
  // 1. Strip out tag-based thoughts: <|channel>thought...<channel|> or similar
  cleaned = cleaned.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '');
  cleaned = cleaned.replace(/<\|channel>thought[\s\S]*?<\|channel\|>/g, '');
  cleaned = cleaned.replace(/<\|thought\|>[\s\S]*?<\/thought>/g, '');
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/g, '');
  
  // 2. Strip out text-based thinking process blocks (e.g. "Thinking Process:\n...")
  // This matches "Thinking Process:" or "Thought:" at the start of string, up to "Summary:" or "Response:" or the actual text.
  cleaned = cleaned.replace(/^(?:Thinking Process|Thought|Reasoning|Analysis):?[\s\S]*?(?:Summary:|Response:|\*\*Summary\*\*:)*/i, '');

  // 3. If "Summary:" is still present, grab everything after it
  if (cleaned.includes('Summary:')) {
    const parts = cleaned.split('Summary:');
    cleaned = parts.slice(1).join('Summary:');
  } else if (cleaned.includes('**Summary**:')) {
    const parts = cleaned.split('**Summary**:');
    cleaned = parts.slice(1).join('**Summary**:');
  }

  // 4. Remove any leftover tags or labels
  cleaned = cleaned.replace(/<\|channel>thought/g, '');
  cleaned = cleaned.replace(/<channel\|>/g, '');
  cleaned = cleaned.replace(/<\|channel\|>/g, '');
  cleaned = cleaned.replace(/<\|thought\|>/g, '');
  cleaned = cleaned.replace(/<\/thought>/g, '');
  cleaned = cleaned.replace(/<thought>/g, '');
  cleaned = cleaned.replace(/^Summary:\s*/i, '');
  cleaned = cleaned.replace(/^\*\*Summary\*\*:\s*/i, '');
  
  return cleaned.trim();
}

async function main() {
  console.log(`[gemma4:worker] Starting (dry_run=${DRY_RUN} limit=${LIMIT ?? 'all'})...`);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Select documents that have LangExtract entities but no Gemma4 summary yet
    let query = `
      SELECT id, source_ref, payload->'derived_enrichment'->'entities' as entities
      FROM parent_atlas_documents
      WHERE payload->'derived_enrichment'->'entities' IS NOT NULL
        AND (payload->'derived_enrichment'->'summary' IS NULL OR payload->'derived_enrichment'->'summary' = '""'::jsonb)
      ORDER BY id ASC
    `;
    if (LIMIT) query += ` LIMIT ${LIMIT}`;

    const res = await pool.query(query);
    console.log(`[gemma4:worker] Found ${res.rows.length} documents needing Gemma4 summary.`);

    let completed = 0;
    let errors = 0;

    for (const doc of res.rows) {
      const entities = doc.entities;
      if (!Array.isArray(entities) || entities.length === 0) continue;

      const factsText = entities
        .slice(0, 30)
        .map(e => `- Found ${e.type}: "${e.text}"`)
        .join('\n');

      console.log(`[gemma4:worker] Summarizing ${doc.source_ref} using ${entities.length} facts...`);

      try {
        let summaryText;
        if (!DRY_RUN) {
          const { summary, backend } = await callGemma4(factsText, doc.source_ref);
          summaryText = sanitizeZeroHiddenThoughts(summary);
          if (!summaryText) throw new Error('Empty summary returned after sanitization');

          // Update parent_atlas_documents.payload.derived_enrichment.summary
          await pool.query(
            `UPDATE parent_atlas_documents
             SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
               'derived_enrichment',
               COALESCE(payload->'derived_enrichment', '{}'::jsonb) || jsonb_build_object('summary', $1::jsonb)
             )
             WHERE id = $2`,
            [JSON.stringify(summaryText), doc.id]
          );

          // Update atlas_packets.metadata.derived_enrichment.summary
          await pool.query(
            `UPDATE atlas_packets
             SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'derived_enrichment',
               COALESCE(metadata->'derived_enrichment', '{}'::jsonb) || jsonb_build_object('summary', $1::jsonb)
             )
             WHERE source_ref = $2 OR source_ref = $3`,
            [JSON.stringify(summaryText), doc.source_ref, `sveltekit-frontend/${doc.source_ref}`]
          );

          // Update nes_chrom_packets.metadata.derived_enrichment.summary
          await pool.query(
            `UPDATE nes_chrom_packets
             SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'derived_enrichment',
               COALESCE(metadata->'derived_enrichment', '{}'::jsonb) || jsonb_build_object('summary', $1::jsonb)
             )
             WHERE source_ref = $2 OR source_ref = $3`,
            [JSON.stringify(summaryText), doc.source_ref, `sveltekit-frontend/${doc.source_ref}`]
          );

          console.log(`      -> [${backend}] Summary: "${summaryText.slice(0, 100)}..."`);
        } else {
          console.log(`[dry-run] Would summarize ${doc.source_ref} using facts:\n${factsText}`);
          summaryText = "Simulated summary for dry-run.";
        }
        completed++;
      } catch (err) {
        console.error(`      [✗] Error summarizing ${doc.source_ref}: ${err.message}`);
        errors++;
      }
    }

    console.log(`[gemma4:worker] Completed. Summarized: ${completed}, Errors: ${errors}`);

  } catch (err) {
    console.error(`[gemma4:worker] Fatal:`, err);
  } finally {
    await pool.end();
  }
}

main();
