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
  type StructuralObservationV1,
} from '$lib/server/atlas/indexing/structural-observation-v1.js';

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
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
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
      if (output.length >= LIMIT) return;
    }
  };
  await visit(root);
  return output.slice(0, LIMIT);
}

function named(rows: StructuralObservationV1[]): StructuralObservationV1[] {
  return rows.filter((row) => Boolean(row.name));
}

function byName(rows: StructuralObservationV1[]): Map<string, StructuralObservationV1[]> {
  const map = new Map<string, StructuralObservationV1[]>();
  for (const row of named(rows)) {
    const key = row.name!;
    const values = map.get(key) ?? [];
    values.push(row);
    map.set(key, values);
  }
  return map;
}

function bestPeer(row: StructuralObservationV1, peers: StructuralObservationV1[]): StructuralObservationV1 | null {
  if (peers.length === 0) return null;
  return [...peers].sort((a, b) => {
    const kindPenaltyA = a.symbolKind === row.symbolKind ? 0 : 1;
    const kindPenaltyB = b.symbolKind === row.symbolKind ? 0 : 1;
    if (kindPenaltyA !== kindPenaltyB) return kindPenaltyA - kindPenaltyB;
    const spanDeltaA = Math.abs(a.startByte - row.startByte) + Math.abs(a.endByte - row.endByte);
    const spanDeltaB = Math.abs(b.startByte - row.startByte) + Math.abs(b.endByte - row.endByte);
    return spanDeltaA - spanDeltaB;
  })[0] ?? null;
}

function compareObservations(left: StructuralObservationV1[], right: StructuralObservationV1[]) {
  const rightNames = byName(right);
  const matches = named(left).map((row) => {
    const peer = bestPeer(row, rightNames.get(row.name!) ?? []);
    return {
      name: row.name,
      left: row,
      right: peer,
      nameMatch: Boolean(peer),
      semanticKindMatch: Boolean(peer && row.symbolKind !== 'UNKNOWN' && peer.symbolKind !== 'UNKNOWN' && row.symbolKind === peer.symbolKind),
      exactSpanMatch: Boolean(peer && row.startByte === peer.startByte && row.endByte === peer.endByte),
      startByteDelta: peer ? peer.startByte - row.startByte : null,
      endByteDelta: peer ? peer.endByte - row.endByte : null,
    };
  });
  const namedCount = matches.length;
  const nameMatches = matches.filter((item) => item.nameMatch).length;
  const semanticKindMatches = matches.filter((item) => item.semanticKindMatch).length;
  const exactSpanMatches = matches.filter((item) => item.exactSpanMatch).length;
  const spanSelfValid = left.every((row) => row.spanValid && row.spanContainsName !== false);

  return {
    namedCount,
    nameMatches,
    semanticKindMatches,
    exactSpanMatches,
    nameMatchRate: namedCount ? nameMatches / namedCount : 1,
    semanticKindMatchRate: namedCount ? semanticKindMatches / namedCount : 1,
    exactSpanMatchRate: namedCount ? exactSpanMatches / namedCount : 1,
    spanSelfValid,
    matches,
  };
}

const head = git('rev-parse', 'HEAD');
const providerPath = 'sveltekit-frontend/src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts';
const providerBlobSha = git('hash-object', providerPath);
const sidecarPath = 'python/miniforge_nlp_sidecar_v2.py';
const sidecarBlobSha = git('hash-object', sidecarPath);
const corpusFiles = await collectFiles(path.resolve(FRONTEND, 'src'));
const sidecar = create8095AstProvider(process.env.MINIFORGE_SIDECAR_URL);
const node = createNodeTreeSitterAstProvider();
const files: Array<Record<string, unknown>> = [];

for (const absolute of corpusFiles) {
  const sourceBytes = await readFile(absolute);
  const source = sourceBytes.toString('utf8');
  const sourceRef = path.relative(REPO_ROOT, absolute).replaceAll('\\', '/');
  const language = EXTENSION_LANGUAGE.get(path.extname(absolute).toLowerCase())!;
  const sourceFingerprint = fingerprintStructuralSource(source);
  const sourceRevision = `sha256:${sourceFingerprint.sha256}`;
  const input = { sourceRef, sourceRevision, language, source };
  const [sidecarResult, nodeResult] = await Promise.all([
    sidecar.materialize(input),
    node.materialize(input),
  ]);
  const sidecarRows = (sidecarResult.evidence?.chunks ?? []).map((chunk) => projectStructuralObservation(sidecarResult.provider, source, chunk));
  const nodeRows = (nodeResult.evidence?.chunks ?? []).map((chunk) => projectStructuralObservation(nodeResult.provider, source, chunk));
  const nodeTo8095 = compareObservations(nodeRows, sidecarRows);
  const sidecarToNode = compareObservations(sidecarRows, nodeRows);

  const gates = {
    sourceBytesFrozen: sourceFingerprint.sha256 === createHash('sha256').update(sourceBytes).digest('hex'),
    nodeSpanSelfValid: nodeTo8095.spanSelfValid,
    sidecarSpanSelfValid: sidecarToNode.spanSelfValid,
    namedSymbolCoverage: nodeTo8095.nameMatchRate === 1 && sidecarToNode.nameMatchRate === 1,
    semanticKindParity: nodeTo8095.semanticKindMatchRate === 1 && sidecarToNode.semanticKindMatchRate === 1,
    exactSpanParity: nodeTo8095.exactSpanMatchRate === 1 && sidecarToNode.exactSpanMatchRate === 1,
  };

  files.push({
    sourceRef,
    language,
    sourceFingerprint,
    sidecar: {
      status: sidecarResult.status,
      engine: sidecarResult.evidence?.engine ?? null,
      engineVersion: sidecarResult.evidence?.engine_version ?? null,
      diagnostics: sidecarResult.diagnostics,
      observations: sidecarRows,
    },
    node: {
      status: nodeResult.status,
      engine: nodeResult.evidence?.engine ?? null,
      engineVersion: nodeResult.evidence?.engine_version ?? null,
      diagnostics: nodeResult.diagnostics,
      observations: nodeRows,
    },
    comparison: { nodeTo8095, sidecarToNode },
    gates,
    fullParity: Object.values(gates).every(Boolean),
  });
}

const count = files.length;
const countGate = (name: string) => files.filter((file) => Boolean((file.gates as Record<string, unknown>)[name])).length;
const fullParityCount = files.filter((file) => file.fullParity === true).length;
const report = {
  schema: 'atlas.node-tree-sitter-corpus-parity.v2',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_NO_PERSISTENCE',
  git: { head, providerPath, providerBlobSha, sidecarPath, sidecarBlobSha },
  corpus: {
    root: 'sveltekit-frontend/src',
    fileCount: count,
    limit: LIMIT,
    maxBytes: MAX_BYTES,
  },
  gates: {
    sourceBytesFrozen: `${countGate('sourceBytesFrozen')}/${count}`,
    nodeSpanSelfValid: `${countGate('nodeSpanSelfValid')}/${count}`,
    sidecarSpanSelfValid: `${countGate('sidecarSpanSelfValid')}/${count}`,
    namedSymbolCoverage: `${countGate('namedSymbolCoverage')}/${count}`,
    semanticKindParity: `${countGate('semanticKindParity')}/${count}`,
    exactSpanParity: `${countGate('exactSpanParity')}/${count}`,
    fullParity: `${fullParityCount}/${count}`,
  },
  interpretation: {
    fragmentIsNotVariable: true,
    unknownSymbolKindIsNotParity: true,
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
  `- git HEAD: \`${head}\``,
  `- Node provider blob: \`${providerBlobSha}\``,
  `- 8095 facade blob: \`${sidecarBlobSha}\``,
  `- corpus files: ${count}`,
  `- source bytes frozen: ${report.gates.sourceBytesFrozen}`,
  `- Node span self-valid: ${report.gates.nodeSpanSelfValid}`,
  `- 8095 span self-valid: ${report.gates.sidecarSpanSelfValid}`,
  `- named-symbol coverage: ${report.gates.namedSymbolCoverage}`,
  `- semantic-kind parity: ${report.gates.semanticKindParity}`,
  `- exact-span parity: ${report.gates.exactSpanParity}`,
  `- full parity: ${report.gates.fullParity}`,
  '',
  'A `fragment` chunk remains semantic kind `UNKNOWN`; this proof never maps chunk-boundary vocabulary to VARIABLE/FUNCTION without structural evidence.',
  'Canonical ownership and persistence remain unchanged.',
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ jsonPath, mdPath, gates: report.gates }, null, 2));
if (fullParityCount !== count) process.exitCode = 2;
