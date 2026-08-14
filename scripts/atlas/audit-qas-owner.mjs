#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd().endsWith('sveltekit-frontend')
  ? path.dirname(process.cwd())
  : process.cwd();
const frontend = path.join(root, 'sveltekit-frontend');
const reportDir = path.join(root, 'docs', 'reports');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const scriptText = fs.readFileSync(path.join(frontend, 'package.json'), 'utf8');

function collectTypeScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(filePath);
    return /\.(ts|mts)$/.test(entry.name) ? [filePath] : [];
  });
}

const retrievalSourceFiles = collectTypeScriptFiles(path.join(frontend, 'src', 'lib', 'server'));
const matrixCallers = retrievalSourceFiles.filter((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const normalizedPath = filePath.replaceAll('\\', '/');
  return /buildCandidateFeatureMatrix\s*\(/.test(source)
    && !normalizedPath.endsWith('/retrieval-candidate-feature-matrix-v1.ts')
    && !normalizedPath.endsWith('/query-adaptive-feature-compiler.ts')
    && !normalizedPath.endsWith('.spec.ts');
});

const owners = {
  graphifyDaily: {
    owner: 'scripts/startup/run-graphify-daily-startup.mjs',
    status: exists('scripts/startup/run-graphify-daily-startup.mjs') && scriptText.includes('"graphify:daily"') ? 'WIRED' : 'MISSING',
  },
  qasSampler: {
    owner: 'sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts',
    status: exists('sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.ts') ? 'WIRED' : 'MISSING',
  },
  somTopology: {
    owner: 'sveltekit-frontend/src/lib/server/retrieval/som-topology-prefilter.ts',
    status: exists('sveltekit-frontend/src/lib/server/retrieval/som-topology-prefilter.ts') ? 'EXISTS_UNPROVEN' : 'MISSING',
  },
  contextManifest: {
    owner: 'sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts',
    status: exists('sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts') ? 'EXISTS_ADOPTION_PENDING' : 'MISSING',
  },
  exactCanonicalLookup: {
    owner: 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
    status: exists('sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts') ? 'EXISTS_PROMOTION_ADAPTER_PENDING' : 'MISSING',
  },
  recommendationKanban: {
    owner: 'sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts',
    status: exists('sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board-recommendations.ts') ? 'EXISTS_LINKAGE_PENDING' : 'MISSING',
  },
  aceBitfrost: {
    owner: 'sveltekit-frontend/src/lib/server/atlas/rlm/bitfrost-policy.ts',
    status: exists('sveltekit-frontend/src/lib/server/atlas/rlm/bitfrost-policy.ts') ? 'EXISTS_POLICY_PENDING' : 'MISSING',
  },
  qasCandidateInput: {
    owner: 'docs/reports/atlas-qas-candidate-features.jsonl',
    status: exists('docs/reports/atlas-qas-candidate-features.jsonl') ? 'AVAILABLE_UNPROVEN' : 'MISSING',
  },
  candidateFeatureMatrixProducer: {
    owner: 'sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts',
    status: matrixCallers.length > 0 ? 'CALLER_FOUND_UNPROVEN' : 'DEFINITION_ONLY_NO_LIVE_CALLER',
    callers: matrixCallers.map((filePath) => path.relative(root, filePath)),
  },
};

const report = {
  schema: 'parent-atlas.qas.owner-audit.v2',
  generatedAt: new Date().toISOString(),
  status: 'OWNER_AUDIT_PARTIAL',
  canonicalQasOwner: owners.qasSampler.owner,
  bundleReference: exists('parent-atlas-qas-bundle') ? 'REFERENCE_ONLY' : 'NOT_PRESENT',
  owners,
  missingRequired: [
    'revision-qualified QAS candidate feature input',
    'live CandidateFeatureMatrixRowV1 producer caller',
    'exact SearchRuntime promotion adapter and recall baseline',
    'SOM/domain route binding',
    'QAS receipt to existing Kanban recommendation linkage',
    'ContextManifest/ExecutionReceipt linkage',
  ],
  invariants: [
    'QAS failure must not block Graphify truth',
    'approximate candidates remain APPROXIMATE_ONLY until exact promotion',
    'QAS does not add a retrieval lane or RRF vote',
    'bundle atlas/qas path is not a second owner',
  ],
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'qas-owner-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(reportDir, 'qas-owner-audit.md'), [
  '# QAS Owner Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Status: **${report.status}**`,
  '',
  `Canonical QAS owner: \`${report.canonicalQasOwner}\``,
  '',
  '## Owners',
  ...Object.entries(owners).map(([name, value]) => `- **${name}** — ${value.status} — \`${value.owner}\``),
  '',
  '## Remaining gates',
  ...report.missingRequired.map((item) => `- ${item}`),
  '',
  '## Invariants',
  ...report.invariants.map((item) => `- ${item}`),
  '',
].join('\n'));

console.log(JSON.stringify({ status: report.status, owners, reportPath: path.join(reportDir, 'qas-owner-audit.json') }, null, 2));
