import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTensorRTBridge } from '../../sveltekit-frontend/scripts/atlas/load-tensorrt-bridge.mjs';
import { buildGraphGatherFixture, proveSimdjsonGraphGather } from './lib/simdjson-graph-gather-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--gpu')) throw new Error('ONLY_OPTION_IS_GPU');
  let freeBytes = null;
  let preflightError = null;
  if (args.includes('--gpu')) {
    try {
      const raw = execFileSync('nvidia-smi', ['--id=0', '--query-gpu=memory.free', '--format=csv,noheader,nounits'],
        { encoding: 'utf8', timeout: 5000 }).trim();
      if (!/^\d+$/.test(raw)) throw new Error('INVALID_GPU_MEMORY_OBSERVATION');
      freeBytes = Number(raw) * 1024 * 1024;
    } catch (error) { preflightError = error.message; }
  }
  const report = { observedAt: new Date().toISOString(), ...proveSimdjsonGraphGather({
    addon: loadTensorRTBridge(), input: buildGraphGatherFixture(), gpu: args.includes('--gpu'), freeBytes,
  }), preflightError };
  const name = `simdjson-graph-gather-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(root, 'docs/reports', name);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  if (report.status === 'BLOCKED_NATIVE_EXPORTS') process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: 'GRAPH_GATHER_PROOF_FAILED', error: error.message }));
  process.exitCode = 1;
}
