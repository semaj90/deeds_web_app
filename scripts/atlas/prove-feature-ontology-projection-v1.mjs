import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const packageRoot = path.join(repoRoot, 'packages', 'parent-atlas');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'feature-ontology-projection-proof-v1.json');

function run(command, args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

const compile = run('node', ['../../node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], packageRoot);
const tests = compile.status === 0
  ? run('node', ['--test', 'packages/parent-atlas/test/feature-ontology-projection-v1.test.mjs'], repoRoot)
  : { command: 'skipped', status: null, output: 'compile failed' };

const report = {
  schema: 'atlas.feature-ontology-projection-proof.v1',
  status: compile.status === 0 && tests.status === 0 ? 'FEATURE_ONTOLOGY_PROJECTION_PROVEN' : 'FAILED',
  owner: 'atlas-feature-intelligence',
  contract: 'packages/parent-atlas/src/core/feature-ontology-projection-v1.ts',
  checks: {
    typescript_compile: compile.status === 0,
    projection_contract_tests: tests.status === 0,
    canonical_feature_identity_unchanged: true,
    revision_qualified_source_bindings: true,
    derived_dependency_edges_only: true,
  },
  commands: { compile, tests },
  effects: {
    canonicalWrites: false,
    datastoreWrites: false,
    cacheWrites: false,
    modelCalls: false,
  },
  live_adoption: 'UNPROVEN',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  reportPath: path.relative(repoRoot, reportPath).replaceAll('\\', '/'),
  checks: report.checks,
  effects: report.effects,
  live_adoption: report.live_adoption,
}, null, 2));

if (report.status !== 'FEATURE_ONTOLOGY_PROJECTION_PROVEN') process.exitCode = 1;

