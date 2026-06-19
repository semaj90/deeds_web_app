#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate as gemmaGenerate } from './gemma4-adapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(ROOT, 'docs', 'reports');
const INPUT_JSON = path.join(DOCS_DIR, 'repo-function-registry-query.json');
const OUTPUT_JSON = path.join(DOCS_DIR, 'mcp-tool-summary-registry.json');
const OUTPUT_MD = path.join(DOCS_DIR, 'mcp-tool-summary-registry.md');

const argv = process.argv.slice(2);
const query = argv.join(' ').trim();

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function formatRows(rows = []) {
  return rows.slice(0, 12).map((row, idx) => [
    `${idx + 1}. ${row.feature_id}`,
    `- source_ref: ${row.source_ref || '(none)'}`,
    `- kind: ${row.kind}`,
    `- score: ${row.score ?? 0}`,
    `- summary: ${String(row.summary || '').slice(0, 180)}`,
  ].join('\n')).join('\n');
}

function extractBriefing(text) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  const markdownStart = value.search(/^#{1,3}\s+/m);
  if (markdownStart >= 0) return value.slice(markdownStart).trim();
  const thoughtMarker = value.search(/<\|channel\>thought/i);
  if (thoughtMarker >= 0) {
    const nextHeader = value.slice(thoughtMarker).search(/^#{1,3}\s+/m);
    if (nextHeader >= 0) {
      return value.slice(thoughtMarker + nextHeader).trim();
    }
  }
  return value.replace(/^.*?(?=^#{1,3}\s+)/ms, '').trim() || value;
}

function buildFallbackBriefing(rows = []) {
  const top = rows.slice(0, 5).map((row) => `- ${row.feature_id} (${row.source_ref})`).join('\n');
  const lanes = [...new Set(rows.flatMap((row) => Array.isArray(row.workflow_lane) ? row.workflow_lane : []))].slice(0, 8);
  const missing = [
    'A live Gemma4 summary endpoint was unavailable, so this briefing is deterministic.',
    'The registry is already canonical in Postgres, but the summarization transport still needs a healthy llama-server or MCP route.',
  ].join(' ');

  return `# MCP Tool Summary Registry

## What exists

${top || '- No rows matched.'}

## What is missing

${missing}

## Next bounded lane

Wire the registry summarizer to the live llama-server path and keep the Postgres-backed registry as the source of truth.

## Observed workflow lanes

${lanes.length ? lanes.map((lane) => `- ${lane}`).join('\n') : '- none'}
`;
}

async function main() {
  const payload = await readJson(INPUT_JSON);
  if (!payload?.rows) {
    console.error(`Missing query registry: ${path.relative(ROOT, INPUT_JSON)}`);
    process.exit(1);
  }

  const prompt = [
    'You are summarizing the indexed Parent Atlas function/tool registry.',
    'Summarize only the top-ranked rows and the operational implications.',
    'Return only the final briefing. Do not include hidden reasoning, chain-of-thought, or tool plan text.',
    'Use plain Markdown only.',
    `Registry source: ${payload.summary?.registry_source ?? 'file'}`,
    `User query: ${query || '(none)'}`,
    `Total matched rows: ${payload.rows.length}`,
    '',
    'Top rows:',
    formatRows(payload.rows),
    '',
    'Return a concise operator briefing with: what exists, what is missing, and the next bounded lane.',
  ].join('\n');

  let summaryText = '';
  try {
    summaryText = extractBriefing(await gemmaGenerate(prompt));
  } catch {
    summaryText = '';
  }
  if (!summaryText) {
    summaryText = buildFallbackBriefing(payload.rows);
  }
  const summary = {
    generated_at: new Date().toISOString(),
    query,
    input: path.relative(ROOT, INPUT_JSON).replace(/\\/g, '/'),
    matched_rows: payload.rows.length,
    summary_text: String(summaryText ?? '').trim(),
  };

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const md = `# MCP Tool Summary Registry

Generated: ${summary.generated_at}
Query: ${summary.query || '(none)'}
Matched rows: ${summary.matched_rows}

## Summary

${summary.summary_text || '(no summary)'}
`;
  await fs.writeFile(OUTPUT_MD, md, 'utf8');

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
