#!/usr/bin/env node

/**
 * EMB1 read-only semantic-card corpus builder.
 * Uses the proven 8095 Tree-sitter structural evidence endpoint and emits a
 * disposable, revision-qualified JSONL corpus. It does not embed or persist
 * anything to Postgres, Qdrant, Neo4j, or Valkey.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sidecarUrl = (process.env.ATLAS_AST_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
const sourceRef = 'fixtures/emb1/semantic-card-corpus.ts';
const sourceRevision = process.env.SOURCE_REVISION ?? gitRevision();
const workspaceRevision = process.env.WORKSPACE_REVISION ?? sourceRevision;
const representationRevision = 'structural-card-v1';
const source = `import { helper } from './helper';
export interface User { id: string; }
export type UserId = string;
export class UserService {
  async getUser(id: UserId): Promise<User> { return helper(id); }
}
export function helper(id: string): User { return { id }; }
`;

function gitRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'workspace-revision-unavailable';
  }
}

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function lineColumnAt(offset) {
  const prefix = source.slice(0, offset);
  const lines = prefix.split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}

function span(startByte, endByte) {
  const start = lineColumnAt(startByte);
  const end = lineColumnAt(endByte);
  return {
    filePath: sourceRef,
    startByte,
    endByte,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

function cardId(kind, name, cardSpan) {
  return `sc_${sha([sourceRef, sourceRevision, kind, name ?? '', cardSpan.startByte, cardSpan.endByte].join('|')).slice(0, 24)}`;
}

function kindOf(chunk) {
  const kind = String(chunk.kind ?? '').toLowerCase();
  if (kind === 'interface') return 'INTERFACE';
  if (kind === 'type') return 'TYPE';
  if (kind === 'class') return 'CLASS';
  if (kind === 'method') return 'METHOD';
  if (kind === 'function') return 'FUNCTION';
  return null;
}

function contextText(card, relationships) {
  const scope = card.scopeChain.length > 0 ? card.scopeChain.join(' > ') : 'module';
  const imports = relationships.imports.length > 0 ? relationships.imports.join(', ') : 'none';
  const exports = relationships.exports.length > 0 ? relationships.exports.join(', ') : 'none';
  const calls = relationships.calls.length > 0 ? relationships.calls.join(', ') : 'none';
  return [
    `FILE ${card.sourceRef}`,
    `KIND ${card.kind}`,
    `NAME ${card.name ?? '(anonymous)'}`,
    `SCOPE ${scope}`,
    `IMPORTS ${imports}`,
    `EXPORTS ${exports}`,
    `CALLS ${calls}`,
    `SOURCE ${card.sourceText}`,
  ].join('\n');
}

async function fetchEvidence() {
  const response = await fetch(`${sidecarUrl}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, language: 'typescript', filePath: sourceRef, sourceRevision }),
    signal: AbortSignal.timeout(Number(process.env.EMB1_TIMEOUT_MS ?? 30_000)),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`AST_SIDECAR_HTTP_${response.status}`);
  if (payload.schema !== 'atlas.ast.evidence.v1' || !Array.isArray(payload.chunks)) {
    throw new Error('AST_SIDECAR_SCHEMA_INVALID');
  }
  return payload;
}

async function main() {
  const report = {
    schema: 'atlas.emb1.semantic-card-corpus-proof.v1',
    status: 'BLOCKED_SIDEcar',
    sidecarUrl,
    engine: 'treesitter-chunker',
    language: 'typescript',
    sourceRef,
    workspaceRevision,
    sourceRevision,
    representationRevision,
    requiredKinds: ['FILE', 'MODULE', 'CLASS', 'INTERFACE', 'FUNCTION', 'METHOD', 'TYPE'],
    observedKinds: [],
    cardCount: 0,
    cards: [],
    diagnostics: [],
    canonicalWrites: false,
  };

  try {
    const evidence = await fetchEvidence();
    const chunks = evidence.chunks.filter((chunk) => kindOf(chunk));
    const byChunkId = new Map(chunks.map((chunk) => [String(chunk.upstream_chunk_id ?? ''), chunk]));
    const scopes = new Map();
    for (const chunk of chunks) {
      const kind = kindOf(chunk);
      if (kind === 'CLASS' && chunk.name) scopes.set(String(chunk.name), [String(chunk.name)]);
    }

    const fileSpan = span(0, Buffer.byteLength(source, 'utf8'));
    const cards = [{
      schema: 'atlas.structural-memory-card.v1',
      cardId: cardId('FILE', sourceRef, fileSpan),
      kind: 'FILE',
      name: sourceRef,
      qualifiedName: sourceRef,
      sourceRef,
      sourceRevision,
      workspaceRevision,
      representationRevision,
      upstreamChunkId: null,
      sourceSpan: fileSpan,
      scopeChain: [],
      sourceText: source.trim(),
      relationships: { imports: [], exports: [], calls: [], references: [] },
      contextualizedText: `FILE ${sourceRef}\nMODULE ${sourceRef}\nSOURCE ${source.trim()}`,
    }, {
      schema: 'atlas.structural-memory-card.v1',
      cardId: cardId('MODULE', sourceRef, fileSpan),
      kind: 'MODULE',
      name: sourceRef.replace(/\.[^.]+$/, ''),
      qualifiedName: sourceRef,
      sourceRef,
      sourceRevision,
      workspaceRevision,
      representationRevision,
      upstreamChunkId: null,
      sourceSpan: fileSpan,
      scopeChain: [],
      sourceText: source.trim(),
      relationships: { imports: [], exports: [], calls: [], references: [] },
      contextualizedText: `MODULE ${sourceRef}\nSOURCE ${source.trim()}`,
    }];

    for (const chunk of chunks) {
      const kind = kindOf(chunk);
      const cardSpan = span(Number(chunk.start_byte), Number(chunk.end_byte));
      const name = chunk.name == null ? null : String(chunk.name);
      const scopeChain = Array.isArray(chunk.parent_route) ? chunk.parent_route.map(String) : [];
      const relationships = {
        imports: [],
        exports: [],
        calls: [],
        references: [],
      };
      for (const edge of evidence.edges ?? []) {
        if (String(edge.from_evidence_key) !== String(chunk.upstream_chunk_id ?? '')) continue;
        const target = String(edge.to_evidence_key ?? '');
        if (edge.type === 'IMPORTS') relationships.imports.push(target);
        if (edge.type === 'EXPORTS') relationships.exports.push(target);
        if (edge.type === 'CALLS') relationships.calls.push(target);
        if (edge.type === 'REFERENCES') relationships.references.push(target);
      }
      const sourceText = source.slice(Number(chunk.start_byte), Number(chunk.end_byte));
      const card = {
        schema: 'atlas.structural-memory-card.v1',
        cardId: cardId(kind, name, cardSpan),
        kind,
        name,
        qualifiedName: [...scopeChain, name].filter(Boolean).join('.'),
        sourceRef,
        sourceRevision,
        workspaceRevision,
        representationRevision,
        upstreamChunkId: chunk.upstream_chunk_id ?? null,
        nodeType: String(chunk.node_type),
        sourceSpan: cardSpan,
        scopeChain,
        sourceText,
        relationships,
      };
      card.contextualizedText = contextText(card, relationships);
      cards.push(card);
    }

    report.cards = cards;
    report.cardCount = cards.length;
    report.observedKinds = [...new Set(cards.map((card) => card.kind))].sort();
    report.diagnostics = Array.isArray(evidence.diagnostics) ? evidence.diagnostics.map(String) : [];
    report.status = report.requiredKinds.every((kind) => report.observedKinds.includes(kind)) ? 'PROVEN' : 'DEGRADED_MISSING_REQUIRED_KIND';
    report.engineVersion = evidence.engine_version;
  } catch (error) {
    report.diagnostics.push(String(error?.message ?? error));
  }

  const reportDir = path.resolve(root, 'docs/reports');
  mkdirSync(reportDir, { recursive: true });
  const jsonlPath = path.join(reportDir, 'emb1-semantic-card-corpus.jsonl');
  const jsonPath = path.join(reportDir, 'emb1-semantic-card-corpus-proof.json');
  const mdPath = path.join(reportDir, 'emb1-semantic-card-corpus-proof.md');
  writeFileSync(jsonlPath, report.cards.map((card) => JSON.stringify(card)).join('\n') + (report.cards.length ? '\n' : ''));
  writeFileSync(jsonPath, `${JSON.stringify({ ...report, artifactPath: jsonlPath }, null, 2)}\n`);
  writeFileSync(mdPath, [
    '# EMB1 Semantic-Card Corpus Proof',
    '',
    `- status: **${report.status}**`,
    `- cards: **${report.cardCount}**`,
    `- observed kinds: \`${report.observedKinds.join(', ')}\``,
    `- source revision: \`${sourceRevision}\``,
    `- representation revision: \`${representationRevision}\``,
    `- canonical writes: **${report.canonicalWrites}**`,
    '',
    'Cards are Tree-sitter structural units with exact spans and provenance. No arbitrary token-window chunks or downstream embeddings are created.',
    '',
  ].join('\n'));
  console.log(JSON.stringify({ status: report.status, cardCount: report.cardCount, observedKinds: report.observedKinds, jsonlPath, jsonPath, mdPath }, null, 2));
  if (report.status !== 'PROVEN') process.exitCode = 2;
}

await main();
