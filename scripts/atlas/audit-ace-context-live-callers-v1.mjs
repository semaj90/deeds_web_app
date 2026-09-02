#!/usr/bin/env node
/** Read-only census for ACE cache/context callers. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/ace-context-live-caller-adoption-v1.json');
const targets = [
  path.resolve(root, 'sveltekit-frontend/src/routes'),
  path.resolve(root, 'sveltekit-frontend/src/lib/server'),
];
const needles = ['redisGetAcePacket', 'redisSetAcePacket', 'hashQuery', 'assembleContext', 'ContextManifestV2', 'aceFeatureBundleProvider', 'buildSearchRuntimeFeatureBundleV1'];

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|mts|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}
function classify(text) {
  const legacy = /redisGetAcePacket|redisSetAcePacket|hashQuery/.test(text);
  const strict = /ContextManifestV2|aceFeatureBundleProvider|buildSearchRuntimeFeatureBundleV1/.test(text);
  if (strict && legacy) return 'STRICT_V2_CAPABLE';
  if (strict) return 'STRICT_V2_WIRED';
  if (legacy) return 'LEGACY_QUERY_CACHE';
  return 'DIAGNOSTIC_ONLY';
}

const callers = [];
for (const file of [...new Set(targets.flatMap(filesUnder))].sort()) {
  const text = fs.readFileSync(file, 'utf8');
  const matched = needles.filter((needle) => text.includes(needle));
  if (matched.length === 0) continue;
  callers.push({ file: path.relative(root, file).replaceAll('\\', '/'), classification: classify(text), matched });
}

const report = {
  schema: 'atlas.ace-context-live-caller-adoption.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_SOURCE_CENSUS',
  callers,
  counts: Object.fromEntries(['LEGACY_QUERY_CACHE', 'STRICT_V2_CAPABLE', 'STRICT_V2_WIRED', 'DIAGNOSTIC_ONLY', 'DEAD'].map((key) => [key, callers.filter((c) => c.classification === key).length])),
  selectedCaller: 'sveltekit-frontend/src/routes/api/ace/context/+server.ts',
  selectedCallerStatus: 'LEGACY_QUERY_CACHE',
  strictCallerAdoption: false,
  writesPerformed: false,
  canonicalAuthority: false,
  nextGate: 'SELECT_CALLER_WITH_VALIDATED_REVISION_BUNDLE',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, callerCount: callers.length, counts: report.counts, writesPerformed: false }, null, 2));
