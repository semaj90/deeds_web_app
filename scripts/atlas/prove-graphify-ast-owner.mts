import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend');
const packageJson = JSON.parse(await readFile(resolve(frontendRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
const scripts = packageJson.scripts ?? {};
const exists = async (path: string) => {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
};

const dailyCommand = scripts['graphify:daily'] ?? null;
const dailyChain = scripts['graphify:daily:chain'] ?? null;
const astFactsCommand = scripts['atlas:ast:facts:apply'] ?? null;
const graphifyChainText = [dailyCommand, dailyChain].filter(Boolean).join(' ');
const astFactsInDailyChain = graphifyChainText.includes('ast-treesitter-facts');
const ownerCandidates = {
  webTreeSitterFacts: await exists(resolve(frontendRoot, 'scripts/atlas/ast-treesitter-facts.mjs')),
  analysisBridge: await exists(resolve(frontendRoot, 'src/lib/server/analysis/ast-langextract-bridge.ts')),
  sidecarClient: await exists(resolve(frontendRoot, 'src/lib/server/nlp/miniforge-nlp-sidecar.ts')),
  legacyExtractor: await exists(resolve(repoRoot, 'scripts/atlas/knowledge-layer/ast-extractor.ts')),
};

const report = {
  schema: 'atlas.graphify.ast-owner-trace.v1',
  generatedAt: new Date().toISOString(),
  graphifyDaily: {
    command: dailyCommand,
    chain: dailyChain,
    invokesExistingAstFactsMaterializer: astFactsInDailyChain,
  },
  existingAstMaterializer: {
    packageScript: astFactsCommand,
    path: 'sveltekit-frontend/scripts/atlas/ast-treesitter-facts.mjs',
    present: ownerCandidates.webTreeSitterFacts,
  },
  replacementCandidates: ownerCandidates,
  canonicalOwnerStatus: astFactsInDailyChain ? 'IDENTIFIED' : 'UNRESOLVED',
  replacementWiringStatus: 'NOT_WIRED',
  fallbackPolicyStatus: 'NOT_DEFINED',
  productionReceiptStatus: 'NOT_WIRED',
  status: astFactsInDailyChain ? 'OWNER_TRACE_PASS' : 'OWNER_SELECTION_BLOCKED',
  conclusion: astFactsInDailyChain
    ? 'The existing AST facts materializer is reachable from graphify:daily; replacement insertion can be evaluated at that boundary.'
    : 'graphify:daily does not invoke the existing AST facts materializer or the 8095 replacement; select one canonical owner before wiring a replacement.',
};

const reportPath = resolve(repoRoot, 'docs/reports/graphify-ast-owner-trace.json');
const markdownPath = resolve(repoRoot, 'docs/reports/graphify-ast-owner-trace.md');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, [
  '# Graphify AST owner trace',
  '',
  `- status: **${report.status}**`,
  `- graphify:daily invokes existing AST facts materializer: **${astFactsInDailyChain ? 'PASS' : 'FAIL'}**`,
  `- canonical owner status: **${report.canonicalOwnerStatus}**`,
  `- replacement wiring: **${report.replacementWiringStatus}**`,
  `- fallback policy: **${report.fallbackPolicyStatus}**`,
  `- production receipt: **${report.productionReceiptStatus}**`,
  '',
  report.conclusion,
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status: report.status, report: reportPath }, null, 2));
if (report.status !== 'OWNER_TRACE_PASS') process.exitCode = 1;
