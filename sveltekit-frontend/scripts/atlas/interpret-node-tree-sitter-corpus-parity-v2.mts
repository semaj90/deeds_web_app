import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { interpretStructuralParityCorpusV1 } from '$lib/server/atlas/indexing/structural-parity-corpus-interpretation-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');

function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const inputPath = path.resolve(
  REPO_ROOT,
  arg('input', 'docs/reports/node-tree-sitter-provider-parity-corpus-v2.json'),
);
const outputPath = path.resolve(
  REPO_ROOT,
  arg('output', 'docs/reports/node-tree-sitter-provider-parity-corpus-v2-interpretation.json'),
);

const raw = JSON.parse(await readFile(inputPath, 'utf8')) as Record<string, unknown>;
const interpretation = interpretStructuralParityCorpusV1(raw);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(interpretation, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: interpretation.status,
  dominantMismatchClass: interpretation.dominantMismatchClass,
  structuralPromotionReviewEligible: interpretation.structuralPromotionReviewEligible,
  spanCompatibility: interpretation.spanCompatibility,
  interpretationChecksum: interpretation.interpretationChecksum,
  outputPath,
}, null, 2));

if (interpretation.status === 'RUNTIME_BLOCKED') process.exitCode = 4;
else if (interpretation.status === 'BYTE_COORDINATE_BLOCKER') process.exitCode = 5;
else if (interpretation.status === 'SYMBOL_COVERAGE_BLOCKER') process.exitCode = 6;
else if (interpretation.status === 'SEMANTIC_KIND_BLOCKER') process.exitCode = 7;
else if (interpretation.status === 'SPAN_POLICY_DIFFERENCE') process.exitCode = 8;
