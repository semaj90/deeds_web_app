import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const required = [
  'src/lib/server/atlas/policy/policy-types.ts',
  'src/lib/server/atlas/policy/policy-state.ts',
  'src/lib/server/atlas/policy/policy-router.ts',
  'src/lib/server/atlas/policy/bounded-executor.ts',
  'src/lib/server/atlas/policy/canonical-reducer.ts',
  'src/lib/server/analysis/hmm-policy-bridge.ts',
];

const missing = required.filter((path) => !existsSync(resolve(root, path)));
if (missing.length) {
  console.error('POLICY_ROUTING_VERIFY=FAIL');
  console.error(`missing=${missing.join(',')}`);
  process.exit(1);
}

const router = readFileSync(resolve(root, 'src/lib/server/atlas/policy/policy-router.ts'), 'utf8');
const executor = readFileSync(resolve(root, 'src/lib/server/atlas/policy/bounded-executor.ts'), 'utf8');
const checks = {
  finiteActions: router.includes("'TERMINATE'"),
  maxThreeTools: router.includes('maxParallelToolCalls: 3'),
  boundedExecutor: executor.includes('maxParallelToolCalls'),
};

const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('POLICY_ROUTING_VERIFY=FAIL');
  console.error(`failed=${failed.join(',')}`);
  process.exit(1);
}
console.log('POLICY_ROUTING_VERIFY=PASS');
console.log(JSON.stringify(checks));
