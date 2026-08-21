#!/usr/bin/env node
import { Pool } from 'pg';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const templatePath = path.join(repoRoot, '.tmp', 'atlas-sparse-relevance-annotation-template.jsonl');
const outputPath = path.join(repoRoot, '.tmp', 'atlas-sparse-relevance-candidate-proposals.jsonl');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const result = {
  schema: 'atlas-sparse-relevance-candidate-proposals-v1',
  status: 'PROPOSALS_NOT_GROUND_TRUTH',
  source_template: templatePath,
  output_path: outputPath,
  query_count: 0,
  candidate_count: 0,
  canonicalWrites: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
  diagnostics: [],
};

try {
  if (!existsSync(templatePath)) throw new Error('Annotation template is missing.');
  const rows = readFileSync(templatePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  result.query_count = rows.length;
  const proposals = [];
  for (const row of rows) {
    const hints = Array.isArray(row.hint_relevant_keywords) ? row.hint_relevant_keywords.filter((value) => typeof value === 'string' && value.trim()) : [];
    if (hints.length === 0) continue;
    const clauses = hints.map((_, index) => `(cci.content ILIKE $${index + 1} OR cci.relative_path ILIKE $${index + 1} OR cci.source_ref ILIKE $${index + 1})`);
    const params = hints.map((hint) => `%${hint}%`);
    const { rows: candidates } = await pool.query(
      `SELECT cci.id, cci.relative_path, cci.source_ref, cci.content_hash, ap.packet_key
       FROM codebase_chunk_index cci
       LEFT JOIN atlas_packets ap ON ap.source_ref = cci.source_ref
       WHERE cci.content IS NOT NULL AND (${clauses.join(' OR ')})
       ORDER BY cci.id ASC
       LIMIT 20`,
      params,
    );
    result.candidate_count += candidates.length;
    proposals.push({
      schema: 'atlas-sparse-relevance-candidate-proposal-v1',
      query_id: row.query_id,
      query: row.query,
      hint_relevant_keywords: hints,
      candidates: candidates.map((candidate) => ({
        chunk_id: candidate.id,
        packet_key: candidate.packet_key ?? null,
        source_ref: candidate.source_ref ?? candidate.relative_path ?? null,
        content_hash: candidate.content_hash ?? null,
        proposal_status: 'PROPOSED_NOT_GROUND_TRUTH',
      })),
      reviewer_action: 'ACCEPT_OR_REJECT_EACH_CANDIDATE',
    });
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${proposals.map((row) => JSON.stringify(row)).join('\n')}${proposals.length ? '\n' : ''}`, 'utf8');
  if (proposals.length === 0) result.diagnostics.push('No keyword-bearing queries produced candidate proposals.');
} catch (error) {
  result.status = 'PROPOSALS_BLOCKED_READ_ONLY_SOURCE_UNAVAILABLE';
  result.diagnostics.push(error instanceof Error ? error.message : String(error));
} finally {
  await pool.end();
}

console.log(JSON.stringify(result, null, 2));
