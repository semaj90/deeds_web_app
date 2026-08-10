import { spawnSync } from 'node:child_process';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('usage: npx tsx scripts/atlas/build-arrow-feature-matrix.mts <rows.jsonl> <out.arrow>');
  process.exit(2);
}
const r = spawnSync('python', ['-m', 'parent_atlas_tensor.cli', 'build-feature', input, output], { stdio: 'inherit' });
process.exit(r.status ?? 1);
