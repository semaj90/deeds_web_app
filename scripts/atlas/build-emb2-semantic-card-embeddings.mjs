#!/usr/bin/env node

/**
 * EMB2 read-only semantic-card embedding builder.
 * Reads the proven EMB1 corpus, calls the canonical Ollama EmbeddingGemma
 * owner, and emits revision-qualified vectors. No Qdrant or canonical writes.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.resolve(root, process.env.EMB1_INPUT ?? 'docs/reports/emb1-semantic-card-corpus.jsonl');
const outputPath = path.resolve(root, process.env.EMB2_OUTPUT ?? 'docs/reports/emb2-semantic-card-embeddings.jsonl');
const sidecar = (process.env.OLLAMA_URL ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434')
  .replace(/^0\.0\.0\.0/, '127.0.0.1')
  .replace(/^(?!https?:\/\/)/, 'http://');
const parsed = new URL(sidecar);
if (!parsed.port) parsed.port = '11434';
const ollamaUrl = parsed.toString().replace(/\/$/, '');
const model = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const dimension = 768;
const representationRevision = 'embeddinggemma-native-768-v1';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function l2Norm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function loadCards() {
  const raw = readFileSync(inputPath, 'utf8').trim();
  if (!raw) throw new Error('EMB1_CORPUS_EMPTY');
  return raw.split(/\r?\n/).map((line) => JSON.parse(line));
}

async function embed(text) {
  const response = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
    signal: AbortSignal.timeout(Number(process.env.EMB2_TIMEOUT_MS ?? 30_000)),
  });
  if (!response.ok) throw new Error(`OLLAMA_EMBED_HTTP_${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.embedding)) throw new Error('OLLAMA_EMBEDDING_MISSING');
  return payload.embedding;
}

async function main() {
  const startedAt = new Date().toISOString();
  const report = {
    schema: 'atlas.emb2.semantic-card-embedding-proof.v1',
    status: 'DEGRADED',
    inputPath,
    outputPath,
    endpoint: ollamaUrl,
    model,
    representationId: 'semantic_768',
    representationRevision,
    dimension,
    sourceCardCount: 0,
    embeddedCardCount: 0,
    failedCardCount: 0,
    cards: [],
    canonicalWrites: false,
    qdrantWrites: false,
    startedAt,
    completedAt: null,
  };

  try {
    const cards = loadCards();
    report.sourceCardCount = cards.length;
    const output = [];
    for (const card of cards) {
      const text = String(card.contextualizedText ?? card.sourceText ?? '').trim();
      if (!text) throw new Error(`EMB2_CARD_TEXT_MISSING:${card.cardId}`);
      try {
        const embedding = await embed(text);
        const finite = embedding.length === dimension && embedding.every((value) => typeof value === 'number' && Number.isFinite(value));
        const norm = finite ? l2Norm(embedding) : null;
        const normalized = norm !== null && Math.abs(norm - 1) <= 0.02;
        if (!finite || !normalized) throw new Error(`EMB2_VECTOR_INVALID:${card.cardId}`);
        output.push({
          schema: 'atlas.semantic-card-embedding.v1',
          cardId: card.cardId,
          kind: card.kind,
          name: card.name,
          sourceRef: card.sourceRef,
          sourceRevision: card.sourceRevision,
          workspaceRevision: card.workspaceRevision,
          cardRepresentationRevision: card.representationRevision,
          representationId: 'semantic_768',
          representationRevision,
          model,
          dimension,
          vector: embedding,
          vectorDigest: digest(Buffer.from(new Float32Array(embedding).buffer)),
          sourceCardDigest: digest(JSON.stringify({ cardId: card.cardId, sourceRef: card.sourceRef, sourceRevision: card.sourceRevision })),
          l2Norm: norm,
        });
        report.embeddedCardCount += 1;
      } catch (error) {
        report.failedCardCount += 1;
        report.cards.push({ cardId: card.cardId, status: 'FAILED', error: String(error?.message ?? error) });
      }
    }
    report.cards.push(...output.map((card) => ({ cardId: card.cardId, status: 'PROVEN', kind: card.kind, dimension: card.dimension, l2Norm: card.l2Norm })));
    writeFileSync(outputPath, output.map((card) => JSON.stringify(card)).join('\n') + (output.length ? '\n' : ''));
    report.status = report.failedCardCount === 0 && report.embeddedCardCount === report.sourceCardCount ? 'PROVEN' : 'DEGRADED_PARTIAL';
  } catch (error) {
    report.error = String(error?.message ?? error);
  }

  report.completedAt = new Date().toISOString();
  const reportDir = path.dirname(outputPath);
  mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.resolve(root, 'docs/reports/emb2-semantic-card-embedding-proof.json');
  const mdPath = path.resolve(root, 'docs/reports/emb2-semantic-card-embedding-proof.md');
  writeFileSync(jsonPath, `${JSON.stringify({ ...report, artifactPath: outputPath }, null, 2)}\n`);
  writeFileSync(mdPath, [
    '# EMB2 Semantic-Card Embedding Proof',
    '',
    `- status: **${report.status}**`,
    `- model: \`${model}\``,
    `- representation: \`semantic_768\` / \`${representationRevision}\``,
    `- cards embedded: **${report.embeddedCardCount}/${report.sourceCardCount}**`,
    `- failed cards: **${report.failedCardCount}**`,
    `- canonical writes: **${report.canonicalWrites}**`,
    `- Qdrant writes: **${report.qdrantWrites}**`,
    '',
    'This is a disposable read-only embedding artifact. It does not modify canonical storage or Qdrant.',
    '',
  ].join('\n'));
  console.log(JSON.stringify({ status: report.status, sourceCardCount: report.sourceCardCount, embeddedCardCount: report.embeddedCardCount, failedCardCount: report.failedCardCount, outputPath, jsonPath, mdPath }, null, 2));
  if (report.status !== 'PROVEN') process.exitCode = 2;
}

await main();
