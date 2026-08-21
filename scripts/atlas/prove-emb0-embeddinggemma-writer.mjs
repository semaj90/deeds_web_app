#!/usr/bin/env node

/**
 * EMB0 read-only proof.
 * Verifies the live EmbeddingGemma owner emits canonical semantic_768 vectors
 * for document and query prompt modes, with revisioned source-card lineage.
 * This script never writes Postgres, Qdrant, Valkey, or embedding artifacts.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rawOllamaUrl = (process.env.OLLAMA_URL ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434')
  .replace(/^0\.0\.0\.0/, '127.0.0.1')
  .replace(/^(?!https?:\/\/)/, 'http://');
const parsedOllamaUrl = new URL(rawOllamaUrl);
if (!parsedOllamaUrl.port) parsedOllamaUrl.port = '11434';
const ollamaUrl = parsedOllamaUrl.toString().replace(/\/$/, '');
const model = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const representationId = 'semantic_768';
const representationRevision = 'embeddinggemma-native-768-v1';
const dimension = 768;
const sourceCard = {
  cardId: 'emb0-source-card-authentication-session-validation',
  kind: 'FUNCTION',
  sourceRef: 'fixtures/emb0/authentication-session-validation.ts',
  packetKey: 'emb0:fixture:authentication-session-validation',
};

function revision(command, fallback) {
  try {
    return execFileSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const workspaceRevision = process.env.WORKSPACE_REVISION ?? revision(['git', 'rev-parse', 'HEAD'], 'workspace-revision-unavailable');
const sourceRevision = process.env.SOURCE_REVISION ?? workspaceRevision;

const prompts = {
  document: '[document] Authentication session validation function verifies a session before protected access.',
  query: '[query] Find code that validates authentication sessions before protected access.',
};

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function norm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

async function embed(prompt) {
  const response = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
    signal: AbortSignal.timeout(Number(process.env.EMB0_TIMEOUT_MS ?? 30_000)),
  });
  if (!response.ok) throw new Error(`OLLAMA_EMBED_HTTP_${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.embedding)) throw new Error('OLLAMA_EMBEDDING_MISSING');
  return payload.embedding;
}

function inspectVector(vector) {
  const finite = vector.length === dimension && vector.every((value) => typeof value === 'number' && Number.isFinite(value));
  const l2Norm = finite ? norm(vector) : null;
  return {
    dimension: vector.length,
    dimensionPass: vector.length === dimension,
    finite,
    normalized: l2Norm !== null && Math.abs(l2Norm - 1) <= 0.02,
    l2Norm,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const report = {
    schema: 'atlas.emb0.embeddinggemma-writer-proof.v1',
    status: 'DEGRADED',
    startedAt,
    completedAt: null,
    endpoint: ollamaUrl,
    model,
    representationId,
    representationRevision,
    dimension,
    workspaceRevision,
    sourceRevision,
    sourceCard,
    promptModes: Object.keys(prompts),
    vectors: {},
    gates: {
      EMBEDDING_OWNER_REACHABLE: false,
      DOCUMENT_PROMPT_PROVEN: false,
      QUERY_PROMPT_PROVEN: false,
      SEMANTIC_768_FINITE_NORMALIZED: false,
      SOURCE_CARD_IDENTITY_PRESENT: true,
      REPRESENTATION_REVISION_PRESENT: true,
    },
    canonicalWrites: false,
    notes: ['Read-only proof; no Postgres, Qdrant, Valkey, or embedding artifact writes.'],
  };

  try {
    const vectors = {};
    for (const [mode, prompt] of Object.entries(prompts)) {
      const vector = await embed(prompt);
      vectors[mode] = {
        promptDigest: digest(prompt),
        embeddingDigest: digest(Buffer.from(new Float32Array(vector).buffer)),
        ...inspectVector(vector),
      };
    }
    report.vectors = vectors;
    report.gates.EMBEDDING_OWNER_REACHABLE = true;
    report.gates.DOCUMENT_PROMPT_PROVEN = Boolean(vectors.document?.dimensionPass);
    report.gates.QUERY_PROMPT_PROVEN = Boolean(vectors.query?.dimensionPass);
    report.gates.SEMANTIC_768_FINITE_NORMALIZED = Object.values(vectors).every((value) => value.dimensionPass && value.finite && value.normalized);
    report.status = Object.values(report.gates).every(Boolean) ? 'PROVEN' : 'DEGRADED';
  } catch (error) {
    report.error = String(error?.message ?? error);
    report.notes.push('Live EmbeddingGemma owner was not reachable or returned an invalid vector.');
  }

  report.completedAt = new Date().toISOString();
  const reportDir = path.resolve(root, 'docs/reports');
  mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'emb0-embeddinggemma-writer-proof.json');
  const mdPath = path.join(reportDir, 'emb0-embeddinggemma-writer-proof.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, [
    '# EMB0 EmbeddingGemma Writer Proof',
    '',
    `- status: **${report.status}**`,
    `- model: \`${model}\``,
    `- representation: \`${representationId}\` / \`${representationRevision}\``,
    `- dimension: **${dimension}**`,
    `- document prompt: **${report.gates.DOCUMENT_PROMPT_PROVEN ? 'PASS' : 'FAIL'}**`,
    `- query prompt: **${report.gates.QUERY_PROMPT_PROVEN ? 'PASS' : 'FAIL'}**`,
    `- source-card identity: **${report.gates.SOURCE_CARD_IDENTITY_PRESENT ? 'PASS' : 'FAIL'}**`,
    `- canonical writes: **${report.canonicalWrites}**`,
    '',
    'This is a read-only writer proof. It does not modify Postgres, Qdrant, Valkey, or embedding artifacts.',
    '',
  ].join('\n'));
  console.log(JSON.stringify({ status: report.status, jsonPath, mdPath, gates: report.gates }, null, 2));
  if (report.status !== 'PROVEN') process.exitCode = 2;
}

await main();
