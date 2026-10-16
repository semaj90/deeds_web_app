import { writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectGraphArtifacts, readOwnershipIndex, readTrackedInventory, searchDailySources,
} from './lib/graphify-daily-discovery-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const help = `Daily Graphify discovery (local, read-only; JSON to stdout)
  node scripts/atlas/graphify-daily-discovery-v1.mjs [inspect] [--sizes] [--hash-graphs]
  node scripts/atlas/graphify-daily-discovery-v1.mjs search --query ContextManifest [--limit 20] [--include-untracked]
    [--owner parent-atlas-retrieval-lineage-dag-convergence]
    [--receipt docs/reports/example.json]
  Optional: --output docs/reports/<new-name>.json (exclusive local report creation)
  inspect counts tracked paths; --sizes measures file metadata; --hash-graphs streams graphs <=64 MiB.
  search reads the existing ownership registry and bounded rg source matches.
  No daily refresh, service access, model import, GPU job, or task-state update is invoked.`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(help); return; }
  const mode = args[0] && !args[0].startsWith('--') ? args.shift() : 'inspect';
  if (!['inspect', 'search'].includes(mode)) throw new Error('MODE_MUST_BE_INSPECT_OR_SEARCH');
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--include-untracked') {
      if (mode !== 'search' || options.includeUntracked) throw new Error('INVALID_SEARCH_OPTION');
      options.includeUntracked = true;
    } else if (flag === '--hash-graphs' || flag === '--sizes') {
      const key = flag === '--sizes' ? 'measureSizes' : 'hashGraphs';
      if (mode !== 'inspect' || options[key]) throw new Error('INVALID_INSPECT_OPTION');
      options[key] = true;
    } else if (['--query', '--limit', '--owner', '--receipt', '--output'].includes(flag)) {
      const key = flag.slice(2);
      if (options[key] !== undefined || args[index + 1] === undefined) throw new Error('DUPLICATE_OR_MISSING_OPTION');
      options[key] = args[++index];
    } else throw new Error(`UNKNOWN_OPTION: ${flag}`);
  }
  if (mode === 'inspect' && ['query', 'limit', 'owner', 'receipt'].some((key) => key in options)) {
    throw new Error('SEARCH_OPTIONS_REQUIRE_SEARCH_MODE');
  }
  let body;
  if (mode === 'inspect') {
    const { trackedPaths, summary } = readTrackedInventory(root, options);
    body = { inventory: summary, ownership: readOwnershipIndex(root),
      graphs: await inspectGraphArtifacts(root, trackedPaths, options) };
  } else {
    const search = await searchDailySources(root, {
      ...options, limit: options.limit === undefined ? 20 : Number(options.limit),
    });
    body = { ownership: readOwnershipIndex(root, options.query, 20), search };
  }
  const report = {
    schema: 'atlas.graphify-daily-discovery.v1', observedAt: new Date().toISOString(), mode,
    status: body.search?.status === 'SEARCH_FAILED' ? 'SEARCH_FAILED' : 'DIAGNOSTIC_COMPLETE',
    canonicalAuthority: false, sourceWritesPerformed: false, datastoreWritesPerformed: false,
    localArtifactWritesPerformed: Boolean(options.output), promotionAuthorized: false, ...body,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    if (!/^docs\/reports\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(options.output)) {
      throw new Error('OUTPUT_MUST_BE_NEW_REPORT_JSON');
    }
    const parent = realpathSync(path.join(root, 'docs/reports'));
    const relative = path.relative(realpathSync(root), parent);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('OUTPUT_OUTSIDE_WORKSPACE');
    writeFileSync(path.join(parent, path.basename(options.output)), json, { encoding: 'utf8', flag: 'wx' });
  }
  process.stdout.write(json);
  if (report.status === 'SEARCH_FAILED') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'DISCOVERY_FAILED', error: error.message })}\n`);
  process.exitCode = 1;
});
