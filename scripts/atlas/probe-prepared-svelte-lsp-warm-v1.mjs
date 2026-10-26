import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';
import { buildIndexedSourceSvelteLspInitializationOptionsV1, mapSymbolByteSpans } from './lib/indexed-source-lsp-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const startupRequestTimeoutMs = Number(process.argv[3] ?? 60_000);
assert.ok(Number.isInteger(startupRequestTimeoutMs) && startupRequestTimeoutMs >= 60_000 && startupRequestTimeoutMs <= 300_000);
const preparedPath = path.resolve(process.argv[2]);
const preparedBytes = fs.readFileSync(preparedPath);
const prepared = JSON.parse(preparedBytes);
assert.equal(prepared.schema, 'atlas.frozen-svelte-project-lsp-probe.v1');
assert.equal(prepared.sync.status, 'COMPLETED');
assert.equal(prepared.after.hashMismatches, 0);
assert.equal(prepared.after.filesCompared, prepared.before.filesCompared);
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const projectRoot = path.join(prepared.probeRoot, 'sveltekit-frontend');
const snapshotRoot = path.join(root, '.tmp/workspace-source-snapshots', prepared.snapshotRevision.slice(7));
const verifiedFiles = [];
for (const relative of [prepared.sourceRef, 'sveltekit-frontend/package.json', 'sveltekit-frontend/tsconfig.json', 'sveltekit-frontend/svelte.config.js', 'sveltekit-frontend/vite.config.ts']) {
  const expected = digest(fs.readFileSync(path.join(snapshotRoot, relative)));
  assert.equal(digest(fs.readFileSync(path.join(prepared.probeRoot, relative))), expected);
  verifiedFiles.push({ path: relative, checksum: expected });
}
assert.equal(digest(fs.readFileSync(path.join(projectRoot, '.svelte-kit/tsconfig.json'))), prepared.generatedConfigChecksum);
const sourceBytes = fs.readFileSync(path.join(prepared.probeRoot, prepared.sourceRef));
assert.equal(digest(sourceBytes), prepared.sourceRevision);
const report = { schema: 'atlas.prepared-svelte-lsp-warm-probe.v1', startedAt: new Date().toISOString(),
  preparedReceipt: path.relative(root, preparedPath), preparedReceiptChecksum: digest(preparedBytes),
  scope: 'PREPARED_FULL_PROJECT_CONTROL_SOURCE_AND_CONFIG_HASHES_VERIFIED', verifiedFiles,
  startupRequestTimeoutMs,
  sourceRef: prepared.sourceRef, sourceRevision: prepared.sourceRevision, attempts: [],
  canonicalAuthority: false, productionWritesPerformed: 0 };
const output = path.join(root, '.tmp/atlas', `prepared-svelte-lsp-warm-${Date.now()}.json`);
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const resolver = createCompilerSemanticResolver({ workspaceRoot: projectRoot,
  serverBinaryRoot: path.join(root, 'sveltekit-frontend'),
  initializationOptions: buildIndexedSourceSvelteLspInitializationOptionsV1({ enableTypeScriptPlugin: true }) });
save();
try {
  for (const phase of ['COLD', 'REPEATED_SAME_SERVER']) {
    const start = Date.now();
    const observation = await resolver.documentSymbols({ sourceRef: prepared.sourceRef,
      sourceRevision: prepared.sourceRevision, sourceAbsolutePath: path.join(prepared.probeRoot, prepared.sourceRef),
      sourceBuffer: sourceBytes, language: 'svelte', timeoutMs: phase === 'COLD' ? startupRequestTimeoutMs : 60_000 });
    const facts = observation.result.status === 'OBSERVED' ? mapSymbolByteSpans(observation.result.symbols, sourceBytes) : [];
    report.attempts.push({ phase, elapsedMs: Date.now() - start, observation, symbolCount: facts.length, symbolFacts: facts });
    save();
    console.log(JSON.stringify({ phase, elapsedMs: Date.now() - start, status: observation.result.status, symbolCount: facts.length }));
  }
} finally {
  await resolver.dispose();
  for (const file of verifiedFiles) assert.equal(digest(fs.readFileSync(path.join(prepared.probeRoot, file.path))), file.checksum);
  report.finishedAt = new Date().toISOString();
  report.status = report.attempts.every(attempt => attempt.observation.result.status === 'OBSERVED')
    ? 'REPEATED_PROJECT_SYMBOLS_OBSERVED' : 'PROJECT_SYMBOLS_UNRESOLVED';
  save();
  console.log(JSON.stringify({ status: report.status, reportPath: path.relative(root, output) }));
}
