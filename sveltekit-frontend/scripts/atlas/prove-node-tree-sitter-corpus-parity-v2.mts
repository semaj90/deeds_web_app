import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { create8095AstProvider } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import { createNodeTreeSitterAstProvider } from '$lib/server/atlas/indexing/node-tree-sitter-ast-provider.js';
import {
  fingerprintStructuralSource,
  projectStructuralObservation,
} from '$lib/server/atlas/indexing/structural-observation-v1.js';
import {
  compareStructuralObservationsV2,
  type StructuralParityMismatchClassV2,
} from '$lib/server/atlas/indexing/structural-parity-comparator-v2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');
const LIMIT = Math.max(1, Number(process.env.ATLAS_AST_PARITY_CORPUS_LIMIT ?? '100'));
const MAX_BYTES = Math.max(1024, Number(process.env.ATLAS_AST_PARITY_MAX_BYTES ?? String(512 * 1024)));

const EXTENSION_LANGUAGE = new Map([
  ['.ts', 'typescript'],
  ['.tsx', 'tsx'],
  ['.js', 'javascript'],
  ['.jsx', 'jsx'],
]);
const SKIP_PARTS = new Set(['node_modules', '.git', '.svelte-kit', 'build', 'dist', 'coverage', '.next', '.turbo']);

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

async function collectFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    if (output.length >= LIMIT) return;
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (output.length >= LIMIT) return;
      if (SKIP_PARTS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      const language = EXTENSION_LANGUAGE.get(path.extname(entry.name).toLowerCase());
      if (!language) continue;
      const info = await stat(absolute);
      if (info.size <= 0 || info.size > MAX_BYTES) continue;
      output.push(absolute);
    }
  };
  await visit(root);
  return output.slice(0, LIMIT);
}

function addCounts(
  target: Partial<Record<StructuralParityMismatchClassV2, number>>,
  source: Partial<Record<StructuralParityMismatchClassV2, number>>,
): void {
  for (const [key, value] of Object.entries(source) as Array<[StructuralParityMismatchClassV2, number]>) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function runtimeUnavailable(result: { status: string; diagnostics: string[]; errorTag?: string }): boolean {
  if (result.status !== 'FAILED') return false;
  return /SIDECAR_UNAVAILABLE|ECONNREFUSED|fetch failed|NODE_TREE_SITTER_RUNTIME|PACKAGE_VERSION_MISSING|Cannot find module/i.test(
    [...result.diagnostics, result.errorTag ?? ''].join('\n'),
  );
}

const head = git('rev-parse', 'HEAD');
const providerPath = 'sveltekit-frontend/src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts';
const providerBlobSha = git('hash-object', providerPath);
const sidecarPath = 'python/miniforge_nlp_sidecar_v2.py';
const sidecarBlobSha = git('hash-object', sidecarPath);
const comparatorPath = 'sveltekit-frontend/src/lib/server/atlas/indexing/structural-parity-comparator-v2.ts';
const comparatorBlobSha = git('hash-object', comparatorPath);
const corpusFiles = await collectFiles(path.resolve(FRONTEND, 'src'));
const sidecar = create8095AstProvider(process.env.MINIFORGE_SIDECAR_URL);
const node = createNodeTreeSitterAstProvider();
const files: Array<Record<string, unknown>> = [];
let blockedRuntimeFiles = 0;

for (const absolute of corpusFiles) {
  const sourceBytes = await readFile(absolute);
  const source = sourceBytes.toString('utf8');
  const sourceRef = path.relative(REPO_ROOT, absolute).replaceAll('\\', '/');
  const language = EXTENSION_LANGUAGE.get(path.extname(absolute).toLowerCase())!;
  const sourceFingerprint = fingerprintStructuralSource(source);
  const diskSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const sourceRevision = `sha256:${sourceFingerprint.sha256}`;
  const input = { sourceRef, sourceRevision, language, source };
  const [sidecarResult, nodeResult] = await Promise.all([
    sidecar.materialize(input),
    node.materialize(input),
  ]);
  const runtimeBlocked = runtimeUnavailable(sidecarResult) || runtimeUnavailable(nodeResult);
  if (runtimeBlocked) blockedRuntimeFiles += 1;

  const sidecarRows = (sidecarResult.evidence?.chunks ?? [])
    .map((chunk) => projectStructuralObservation(sidecarResult.provider, source, chunk));
  const nodeRows = (nodeResult.evidence?.chunks ?? [])
    .map((chunk) => projectStructuralObservation(nodeResult.provider, source, chunk));
  const comparison = compareStructuralObservationsV2(nodeRows, sidecarRows);

  const gates = {
    runtimeAvailable: !runtimeBlocked,
    sourceBytesFrozen: sourceFingerprint.sha256 === diskSha256,
    nodeSpanSelfValid: comparison.gates.leftSpanSelfValid,
    sidecarSpanSelfValid: comparison.gates.rightSpanSelfValid,
    namedSymbolCoverage: comparison.gates.namedSymbolCoverage,
    semanticKindParity: comparison.gates.semanticKindParity,
    exactSpanParity: comparison.gates.exactSpanParity,
  };

  files.push({
    sourceRef,
    language,
    sourceFingerprint,
    diskSha256,
    sidecar: {
      status: sidecarResult.status,
      engine: sidecarResult.evidence?.engine ?? null,
      engineVersion: sidecarResult.evidence?.engine_version ?? null,
      diagnostics: sidecarResult.diagnostics,
      observationCount: sidecarRows.length,
    },
    node: {
      status: nodeResult.status,
      engine: nodeResult.evidence?.engine ?? null,
      engineVersion: nodeResult.evidence?.engine_version ?? null,
      diagnostics: nodeResult.diagnostics,
      observationCount: nodeRows.length,
    },
    comparison,
    gates,
    fullParity: Object.values(gates).every(Boolean),
  });
}

const count = files.length;
const countGate = (name: string) => files.filter((file) => Boolean((file.gates as Record<string, unknown>)[name])).length;
const fullParityCount = files.filter((file) => file.fullParity === true).length;
const aggregateMismatchCounts: Partial<Record<StructuralParityMismatchClassV2, number>> = {};
for (const file of files) {
  addCounts(
    aggregateMismatchCounts,
    ((file.comparison as { mismatchCounts: Partial<Record<StructuralParityMismatchClassV2, number>> }).mismatchCounts),
  );
}

const status = blockedRuntimeFiles > 0
  ? 'BLOCKED_RUNTIME_UNAVAILABLE'
  : fullParityCount === count
    ? 'CORPUS_PARITY_PROVEN'
    : 'CORPUS_PARITY_MISMATCH';

const report = {
  schema: 'atlas.node-tree-sitter-corpus-parity.v2',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_NO_PERSISTENCE',
  status,
  git: {
    head,
    providerPath,
    providerBlobSha,
    sidecarPath,
    sidecarBlobSha,
    comparatorPath,
    comparatorBlobSha,
  },
  corpus: {
    root: 'sveltekit-frontend/src',
    fileCount: count,
    limit: LIMIT,
    maxBytes: MAX_BYTES,
  },
  gates: {
    runtimeAvailable: `${countGate('runtimeAvailable')}/${count}`,
    sourceBytesFrozen: `${countGate('sourceBytesFrozen')}/${count}`,
    nodeSpanSelfValid: `${countGate('nodeSpanSelfValid')}/${count}`,
    sidecarSpanSelfValid: `${countGate('sidecarSpanSelfValid')}/${count}`,
    namedSymbolCoverage: `${countGate('namedSymbolCoverage')}/${count}`,
    semanticKindParity: `${countGate('semanticKindParity')}/${count}`,
    exactSpanParity: `${countGate('exactSpanParity')}/${count}`,
    fullParity: `${fullParityCount}/${count}`,
  },
  mismatchCounts: aggregateMismatchCounts,
  interpretation: {
    fragmentIsNotVariable: true,
    unknownSymbolKindIsNotParity: true,
    duplicateNamesUseOneToOneMatching: true,
    exactSpanParityRequiresOriginalRequestByteCoordinates: true,
    canonicalOwnerChanged: false,
    promotionAllowed: false,
  },
  files,
};

await mkdir(REPORT_DIR, { recursive: true });
const jsonPath = path.resolve(REPORT_DIR, 'node-tree-sitter-provider-parity-corpus-v2.json');
const mdPath = path.resolve(REPORT_DIR, 'node-tree-sitter-provider-parity-corpus-v2.md');
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(mdPath, [
  '# Node Tree-sitter vs 8095 corpus parity v2',
  '',
  `- status: **${status}**`,
  `- git HEAD: \`${head}\``,
  `- Node provider blob: \`${providerBlobSha}\``,
  `- 8095 facade blob: \`${sidecarBlobSha}\``,
  `- comparator blob: \`${comparatorBlobSha}\``,
  `- corpus files: ${count}`,
  `- runtime available: ${report.gates.runtimeAvailable}`,
  `- source bytes frozen: ${report.gates.sourceBytesFrozen}`,
  `- Node span self-valid: ${report.gates.nodeSpanSelfValid}`,
  `- 8095 span self-valid: ${report.gates.sidecarSpanSelfValid}`,
  `- named-symbol coverage: ${report.gates.namedSymbolCoverage}`,
  `- semantic-kind parity: ${report.gates.semanticKindParity}`,
  `- exact-span parity: ${report.gates.exactSpanParity}`,
  `- full parity: ${report.gates.fullParity}`,
  '',
  '## Aggregate mismatch classes',
  '',
  ...Object.entries(aggregateMismatchCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- ${key}: ${value}`),
  '',
  'Duplicate names are paired one-to-one. A `fragment` chunk remains semantic kind `UNKNOWN`; UNKNOWN never counts as semantic parity.',
  'Canonical ownership and persistence remain unchanged.',
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status, jsonPath, mdPath, gates: report.gates, mismatchCounts: aggregateMismatchCounts }, null, 2));
if (status === 'BLOCKED_RUNTIME_UNAVAILABLE') process.exitCode = 4;
else if (status !== 'CORPUS_PARITY_PROVEN') process.exitCode = 2;
