import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  create8095AstProvider,
  type AstProviderResult,
  type CanonicalSourceRef,
} from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import { createNodeTreeSitterAstProvider } from '$lib/server/atlas/indexing/node-tree-sitter-ast-provider.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(appRoot, '..');
const producerRevision = 'atlas.node-8095-ast-parity-proof.v1';
const workspaceRevision = process.env.ATLAS_WORKSPACE_REVISION?.trim() || 'proof:workspace-current';

type ProofOutcome =
  | 'PARITY_PROVEN_ON_FIXTURES'
  | 'PARITY_MISMATCH'
  | 'BLOCKED_RUNTIME_UNAVAILABLE';

type ComparableDeclaration = {
  kind: string;
  name: string;
  startByte: number;
  endByte: number;
};

type Fixture = CanonicalSourceRef & {
  id: string;
  malformed: boolean;
};

const fixtures: Fixture[] = [
  {
    id: 'typescript-clean',
    sourceRef: 'proof-fixtures/parity/clean.ts',
    sourceRevision: 'proof:clean-ts:v1',
    language: 'typescript',
    malformed: false,
    source: [
      "import { z } from 'zod';",
      'export interface User { id: string }',
      'export type UserId = User[\'id\'];',
      'export class Store {',
      '  get(id: UserId): User { return { id }; }',
      '}',
      'export function load(store: Store, id: UserId) { return store.get(id); }',
    ].join('\n'),
  },
  {
    id: 'typescript-malformed',
    sourceRef: 'proof-fixtures/parity/malformed.ts',
    sourceRevision: 'proof:malformed-ts:v1',
    language: 'typescript',
    malformed: true,
    source: 'export function broken(value: string { return value; }',
  },
  {
    id: 'tsx-clean',
    sourceRef: 'proof-fixtures/parity/view.tsx',
    sourceRevision: 'proof:tsx:v1',
    language: 'tsx',
    malformed: false,
    source: [
      'export interface Props { title: string }',
      'export function View(props: Props) {',
      '  return <section>{props.title}</section>;',
      '}',
    ].join('\n'),
  },
];

function normalizeKind(value: string): string {
  const kind = value.trim().toUpperCase();
  if (kind.includes('FUNCTION')) return 'FUNCTION';
  if (kind.includes('METHOD')) return 'METHOD';
  if (kind.includes('CLASS')) return 'CLASS';
  if (kind.includes('INTERFACE')) return 'INTERFACE';
  if (kind.includes('TYPE')) return 'TYPE';
  if (kind.includes('ENUM')) return 'ENUM';
  if (kind.includes('VARIABLE')) return 'VARIABLE';
  return kind;
}

function comparable(result: AstProviderResult): ComparableDeclaration[] {
  if (!result.evidence) return [];
  const rows = result.evidence.chunks
    .filter((chunk) => Boolean(chunk.name?.trim()))
    .map((chunk) => ({
      kind: normalizeKind(chunk.kind || chunk.node_type),
      name: chunk.name!.trim(),
      startByte: chunk.start_byte,
      endByte: chunk.end_byte,
    }));

  const deduped = new Map<string, ComparableDeclaration>();
  for (const row of rows) {
    const key = `${row.kind}:${row.name}:${row.startByte}:${row.endByte}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return [...deduped.values()].sort((a, b) =>
    a.startByte - b.startByte
    || a.endByte - b.endByte
    || a.kind.localeCompare(b.kind)
    || a.name.localeCompare(b.name));
}

function runtimeUnavailable(result: AstProviderResult): boolean {
  if (result.status !== 'FAILED') return false;
  const text = [...result.diagnostics, result.errorTag ?? ''].join('\n');
  return /SIDECAR_UNAVAILABLE|ECONNREFUSED|fetch failed|NODE_TREE_SITTER_RUNTIME|PACKAGE_VERSION_MISSING|Cannot find module/i.test(text);
}

function declarationKey(row: ComparableDeclaration): string {
  return `${row.kind}:${row.name}:${row.startByte}:${row.endByte}`;
}

const sidecar = create8095AstProvider(process.env.MINIFORGE_SIDECAR_URL);
const node = createNodeTreeSitterAstProvider();
const fixtureReports: Array<Record<string, unknown>> = [];
let blocked = false;
let mismatch = false;

for (const fixture of fixtures) {
  const [sidecarResult, nodeResult] = await Promise.all([
    sidecar.materialize(fixture),
    node.materialize(fixture),
  ]);

  if (runtimeUnavailable(sidecarResult) || runtimeUnavailable(nodeResult)) blocked = true;

  const sidecarRows = comparable(sidecarResult);
  const nodeRows = comparable(nodeResult);
  const sidecarKeys = new Set(sidecarRows.map(declarationKey));
  const nodeKeys = new Set(nodeRows.map(declarationKey));
  const missingFromNode = sidecarRows.filter((row) => !nodeKeys.has(declarationKey(row)));
  const missingFrom8095 = nodeRows.filter((row) => !sidecarKeys.has(declarationKey(row)));
  const declarationParity = missingFromNode.length === 0 && missingFrom8095.length === 0;

  const malformedParity = !fixture.malformed || (
    sidecarResult.status !== 'PROVEN'
    && nodeResult.status !== 'PROVEN'
    && sidecarResult.diagnostics.length > 0
    && nodeResult.diagnostics.length > 0
  );

  const fixturePass = !runtimeUnavailable(sidecarResult)
    && !runtimeUnavailable(nodeResult)
    && declarationParity
    && malformedParity;
  if (!fixturePass && !blocked) mismatch = true;

  fixtureReports.push({
    id: fixture.id,
    sourceRef: fixture.sourceRef,
    malformed: fixture.malformed,
    sidecar: {
      provider: sidecarResult.provider,
      status: sidecarResult.status,
      diagnostics: sidecarResult.diagnostics,
      declarations: sidecarRows,
    },
    node: {
      provider: nodeResult.provider,
      status: nodeResult.status,
      diagnostics: nodeResult.diagnostics,
      declarations: nodeRows,
    },
    gates: {
      declarationParity,
      malformedRecoveryParity: malformedParity,
      fixturePass,
    },
    differences: {
      missingFromNode,
      missingFrom8095,
    },
  });
}

const status: ProofOutcome = blocked
  ? 'BLOCKED_RUNTIME_UNAVAILABLE'
  : mismatch
    ? 'PARITY_MISMATCH'
    : 'PARITY_PROVEN_ON_FIXTURES';

const report = {
  schema: 'atlas.node-8095-ast-provider-parity-proof.v1',
  generatedAt: new Date().toISOString(),
  producerRevision,
  workspaceRevision,
  mode: 'READ_ONLY_NO_PERSISTENCE',
  status,
  canonicalOwnerChanged: false,
  nodeProviderPromotionAllowed: false,
  treeEditIncrementalReuseProven: false,
  fixtures: fixtureReports,
};

const outputJson = resolve(repoRoot, 'docs/reports/node-treesitter-8095-parity-proof.json');
const outputMd = resolve(repoRoot, 'docs/reports/node-treesitter-8095-parity-proof.md');
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(outputMd, [
  '# Node Tree-sitter vs 8095 provider parity proof',
  '',
  `- status: **${status}**`,
  '- mode: READ_ONLY_NO_PERSISTENCE',
  '- canonical owner changed: false',
  '- Node provider promotion allowed: false',
  '- native old-tree incremental reuse proven: false',
  '',
  '## Fixtures',
  '',
  ...fixtureReports.map((item) => {
    const gates = item.gates as Record<string, unknown>;
    return `- ${item.id}: declarationParity=${gates.declarationParity}; malformedRecoveryParity=${gates.malformedRecoveryParity}; pass=${gates.fixturePass}`;
  }),
  '',
  'A parity pass proves only fixture-level structural compatibility. It does not transfer canonical identity authority from 8095/GIS to the Node challenger.',
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status, outputJson, outputMd }, null, 2));
if (status === 'PARITY_MISMATCH') process.exitCode = 1;
