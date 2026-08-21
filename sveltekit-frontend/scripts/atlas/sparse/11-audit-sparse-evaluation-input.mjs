#!/usr/bin/env node
import path from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const workspaceRoot = path.resolve(__dirname, '../../../..');
const inputPath = path.join(workspaceRoot, 'scripts', 'eval', 'data', 'labeled_queries.json');
const outputPath = path.join(repoRoot, '.tmp', 'atlas-sparse-evaluation-input-audit.json');

const report = {
  schema: 'atlas-sparse-evaluation-input-audit-v1',
  status: 'MISSING_PACKET_LEVEL_GROUND_TRUTH',
  input_path: inputPath,
  input_exists: existsSync(inputPath),
  query_count: 0,
  fields: {
    stable_query_id: false,
    query_text: false,
    packet_key_judgments: false,
    source_ref_judgments: false,
    graded_relevance: false,
  },
  diagnostics: [],
  canonicalWrites: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
};

if (!report.input_exists) {
  report.diagnostics.push('No labeled query file was found.');
} else {
  try {
    const input = JSON.parse(readFileSync(inputPath, 'utf8'));
    const queries = Array.isArray(input.queries) ? input.queries : [];
    report.query_count = queries.length;
    report.fields.stable_query_id = queries.length > 0 && queries.every((row) => typeof row?.query_id === 'string' || Number.isInteger(row?.query_id));
    report.fields.query_text = queries.length > 0 && queries.every((row) => typeof row?.query === 'string' && row.query.trim().length > 0);
    report.fields.packet_key_judgments = queries.length > 0 && queries.every((row) => Array.isArray(row?.relevant_packet_keys));
    report.fields.source_ref_judgments = queries.length > 0 && queries.every((row) => Array.isArray(row?.relevant_source_refs));
    report.fields.graded_relevance = queries.length > 0 && queries.every((row) => Array.isArray(row?.judgments));

    if (queries.length === 0) report.diagnostics.push('The query file contains no queries.');
    if (!report.fields.stable_query_id) report.diagnostics.push('Stable query_id values are missing or invalid.');
    if (!report.fields.query_text) report.diagnostics.push('Query text is missing or invalid.');
    if (!report.fields.packet_key_judgments) report.diagnostics.push('Packet-level relevant_packet_keys judgments are missing.');
    if (!report.fields.source_ref_judgments) report.diagnostics.push('Source-level relevant_source_refs judgments are missing.');
    if (!report.fields.graded_relevance) report.diagnostics.push('Graded relevance judgments are missing.');

    const packetGroundTruth = report.fields.packet_key_judgments || report.fields.source_ref_judgments;
    report.status = packetGroundTruth && report.fields.stable_query_id && report.fields.query_text
      ? 'PACKET_LEVEL_INPUT_READY_FOR_EXECUTOR'
      : 'MISSING_PACKET_LEVEL_GROUND_TRUTH';
  } catch (error) {
    report.status = 'INVALID_GROUND_TRUTH_FILE';
    report.diagnostics.push(`Unable to parse the labeled query file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, output_path: outputPath }, null, 2));
