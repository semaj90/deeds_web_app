import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GraphifyStructuralMaterializer, create8095AstProvider } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import { createNodeTreeSitterAstProvider } from '$lib/server/atlas/indexing/node-tree-sitter-ast-provider.js';
import { probeNodeTreeSitterRuntime } from '$lib/server/atlas/language/node-tree-sitter-structured-value.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');

const fixtures = [
  {
    id: 'valid-function',
    sourceRef: 'proof-fixtures/node-tree-sitter/valid-function.ts',
    sourceRevision: 'proof:node-tree-sitter:valid:v1',
    language: 'typescript',
    source: 'export function alpha(value: number): number { return value + 1; }',
  },
  {
    id: 'valid-class',
    sourceRef: 'proof-fixtures/node-tree-sitter/valid-class.ts',
    sourceRevision: 'proof:node-tree-sitter:class:v1',
    language: 'typescript',
    source: 'export class Counter { inc(value: number) { return value + 1; } }',
  },
  {
    id: 'malformed',
    sourceRef: 'proof-fixtures/node-tree-sitter/malformed.ts',
    sourceRevision: 'proof:node-tree-sitter:malformed:v1',
    language: 'typescript',
    source: 'export function broken( { return 1; ',
  },
] as const;

function symbolRows(result: Awaited<ReturnType<GraphifyStructuralMaterializer['materialize']>>) {
  return (result.evidence?.chunks ?? []).map((chunk) => ({
    nodeType: chunk.node_type,
    kind: chunk.kind,
    name: chunk.name ?? null,
    startByte: chunk.start_byte,
    endByte: chunk.end_byte,
    parentRoute: chunk.parent_route ?? [],
  }));
}

function meaningfulRows(rows: ReturnType<typeof symbolRows>) {
  return rows.filter((row) => row.name || ['function', 'method', 'class', 'interface', 'type', 'enum', 'variable'].includes(row.kind));
}

function compareRows(left: ReturnType<typeof symbolRows>, right: ReturnType<typeof symbolRows>) {
  const a = meaningfulRows(left);
  const b = meaningfulRows(right);
  const rightByName = new Map(b.filter((row) => row.name).map((row) => [`${row.kind}:${row.name}`, row]));
  const matches = a.filter((row) => {
    if (!row.name) return false;
    const other = rightByName.get(`${row.kind}:${row.name}`);
    return Boolean(other && other.startByte === row.startByte && other.endByte === row.endByte);
  });
  return {
    leftCount: a.length,
    rightCount: b.length,
    exactNamedSpanMatches: matches.length,
    exactNamedSpanParity: a.length > 0 && a.every((row) => {
      if (!row.name) return true;
      const other = rightByName.get(`${row.kind}:${row.name}`);
      return Boolean(other && other.startByte === row.startByte && other.endByte === row.endByte);
    }),
  };
}

const runtime = probeNodeTreeSitterRuntime('typescript');
if (!runtime.available) {
  const report = {
    schema: 'atlas.node-tree-sitter-provider-parity.v1',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED_RUNTIME_UNAVAILABLE',
    runtime,
    canonicalOwnerChanged: false,
    persistenceAttempted: false,
    fixtures: [],
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(path.resolve(REPORT_DIR, 'node-tree-sitter-provider-parity.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(4);
}

const sidecar = new GraphifyStructuralMaterializer(create8095AstProvider());
const node = new GraphifyStructuralMaterializer(createNodeTreeSitterAstProvider());
const results = [];

for (const fixture of fixtures) {
  const [sidecarResult, nodeResult] = await Promise.all([
    sidecar.materialize(fixture),
    node.materialize(fixture),
  ]);
  const sidecarRows = symbolRows(sidecarResult);
  const nodeRows = symbolRows(nodeResult);
  const comparison = compareRows(sidecarRows, nodeRows);
  const malformed = fixture.id === 'malformed';
  const diagnosticParity = malformed
    ? sidecarResult.diagnostics.length > 0 && nodeResult.diagnostics.length > 0
    : sidecarResult.status === 'PROVEN' && nodeResult.status === 'PROVEN';

  results.push({
    id: fixture.id,
    sourceRef: fixture.sourceRef,
    sidecar: {
      provider: sidecarResult.provider,
      status: sidecarResult.status,
      diagnostics: sidecarResult.diagnostics,
      promotionAllowed: sidecarResult.provenanceReadiness.canonicalPromotionAllowed,
      rows: sidecarRows,
    },
    node: {
      provider: nodeResult.provider,
      status: nodeResult.status,
      diagnostics: nodeResult.diagnostics,
      promotionAllowed: nodeResult.provenanceReadiness.canonicalPromotionAllowed,
      rows: nodeRows,
    },
    comparison,
    diagnosticParity,
    pass: diagnosticParity && (malformed || comparison.exactNamedSpanParity),
  });
}

const status = results.every((item) => item.pass) ? 'PARITY_PROVEN_ON_FIXTURES' : 'PARITY_MISMATCH';
const report = {
  schema: 'atlas.node-tree-sitter-provider-parity.v1',
  generatedAt: new Date().toISOString(),
  status,
  runtime,
  canonicalOwnerChanged: false,
  defaultGraphifyProvider: 'treesitter-chunker-8095',
  challengerProvider: 'node-tree-sitter-challenger',
  persistenceAttempted: false,
  acceptanceRule: 'Node provider may not replace 8095 until fixture parity and production-corpus parity pass; no provider selection establishes canonical identity.',
  fixtures: results,
};

await mkdir(REPORT_DIR, { recursive: true });
const jsonPath = path.resolve(REPORT_DIR, 'node-tree-sitter-provider-parity.json');
const mdPath = path.resolve(REPORT_DIR, 'node-tree-sitter-provider-parity.md');
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(mdPath, [
  '# Node Tree-sitter AstProvider parity',
  '',
  `- status: **${status}**`,
  `- parser revision: ${runtime.parser_revision}`,
  `- grammar revision: ${runtime.grammar_revision}`,
  '- canonical owner changed: NO',
  '- persistence attempted: NO',
  '- default Graphify provider remains: `treesitter-chunker-8095`',
  '',
  ...results.map((item) => `- ${item.id}: ${item.pass ? 'PASS' : 'FAIL'}; exact-span=${item.comparison.exactNamedSpanParity}; diagnostics=${item.diagnosticParity}`),
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status, jsonPath, mdPath, fixtures: results.map((item) => ({ id: item.id, pass: item.pass })) }, null, 2));
if (status !== 'PARITY_PROVEN_ON_FIXTURES') process.exitCode = 3;
