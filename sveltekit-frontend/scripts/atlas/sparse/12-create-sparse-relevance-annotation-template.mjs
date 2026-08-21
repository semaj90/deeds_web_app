#!/usr/bin/env node
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const workspaceRoot = path.resolve(__dirname, '../../../..');
const inputPath = path.join(workspaceRoot, 'scripts', 'eval', 'data', 'labeled_queries.json');
const outputPath = path.join(repoRoot, '.tmp', 'atlas-sparse-relevance-annotation-template.jsonl');

if (!existsSync(inputPath)) {
  console.error(JSON.stringify({ status: 'BLOCKED_INPUT_MISSING', input_path: inputPath }, null, 2));
  process.exitCode = 0;
} else {
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  const queries = Array.isArray(input.queries) ? input.queries : [];
  const rows = queries.map((query) => ({
    schema: 'atlas-sparse-relevance-judgment-v1',
    query_id: query.query_id,
    query: query.query,
    domain: query.domain ?? null,
    hint_relevant_keywords: Array.isArray(query.relevant_keywords) ? query.relevant_keywords : [],
    hint_min_relevant_docs: Number.isInteger(query.min_relevant_docs) ? query.min_relevant_docs : null,
    relevant_packet_keys: [],
    relevant_source_refs: [],
    graded_judgments: [],
    annotation_status: 'NEEDS_HUMAN_REVIEW',
    provenance: {
      source_file: inputPath,
      generated_from_keyword_hints: true,
      labels_invented: false,
      canonicalWrites: false,
    },
  }));

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`, 'utf8');
  console.log(JSON.stringify({
    status: 'ANNOTATION_TEMPLATE_READY',
    query_count: rows.length,
    output_path: outputPath,
    annotation_required: true,
    labels_invented: false,
    canonicalWrites: false,
    qdrantWrites: false,
    postgresWrites: false,
    valkeyWrites: false,
  }, null, 2));
}
