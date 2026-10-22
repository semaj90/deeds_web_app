import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';
import { buildIndexedSourceSvelteLspInitializationOptionsV1 } from './lib/indexed-source-lsp-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const preparedBytes = fs.readFileSync(path.resolve(process.argv[2]));
const prepared = JSON.parse(preparedBytes);
assert.equal(prepared.after.hashMismatches, 0);
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const projectRoot = path.join(prepared.probeRoot, 'sveltekit-frontend');
const sourcePath = path.join(prepared.probeRoot, prepared.sourceRef);
const sourceBytes = fs.readFileSync(sourcePath);
assert.equal(digest(sourceBytes), prepared.sourceRevision);
assert.equal(digest(fs.readFileSync(path.join(projectRoot, '.svelte-kit/tsconfig.json'))), prepared.generatedConfigChecksum);
const report = { schema: 'atlas.prepared-svelte-lsp-cpu-profile.v1', startedAt: new Date().toISOString(),
  preparedReceiptChecksum: digest(preparedBytes), sourceRef: prepared.sourceRef,
  sourceRevision: prepared.sourceRevision, profiles: [], canonicalAuthority: false, productionWritesPerformed: 0 };
const output = path.join(root, '.tmp/atlas', `prepared-svelte-lsp-cpu-${Date.now()}.json`);
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
save();
const previousOptions = process.env.NODE_OPTIONS;
process.env.NODE_OPTIONS = `${previousOptions ?? ''} --inspect=127.0.0.1:0`.trim();
const resolver = createCompilerSemanticResolver({ workspaceRoot: projectRoot, serverBinaryRoot: path.join(root, 'sveltekit-frontend'),
  initializationOptions: buildIndexedSourceSvelteLspInitializationOptionsV1({ enableTypeScriptPlugin: true }) });
let socket;
let settled = false;
const pendingSymbols = resolver.documentSymbols({ sourceRef: prepared.sourceRef, sourceRevision: prepared.sourceRevision,
  sourceAbsolutePath: sourcePath, sourceBuffer: sourceBytes, language: 'svelte', timeoutMs: 60_000 }).finally(() => { settled = true; });
try {
  let server;
  for (let attempt = 0; attempt < 150; attempt++) {
    server = resolver.getServerProcessDiagnostics().find(entry => /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/.test(entry.stderr));
    if (server || settled) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(server, 'disposable LSP inspector endpoint missing');
  report.workerProcessId = server.processId;
  socket = new WebSocket(server.stderr.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)[1]);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const requests = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) requests.get(message.id)?.(message);
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { requests.delete(id); reject(new Error(`INSPECTOR_TIMEOUT:${method}`)); }, 10_000);
    requests.set(id, message => {
      clearTimeout(timeout); requests.delete(id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await request('Profiler.enable');
  for (const phase of ['EARLY', 'LATER']) {
    if (settled) break;
    await request('Profiler.start');
    await new Promise(resolve => setTimeout(resolve, 8000));
    const { profile } = await request('Profiler.stop');
    const samples = new Map();
    const parents = new Map();
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
    const ancestors = node => {
      const stack = [];
      let parent = parents.get(node.id);
      while (parent !== undefined && stack.length < 10) {
        const frame = nodes.get(parent).callFrame;
        stack.push({ functionName: frame.functionName, url: frame.url, lineNumber: frame.lineNumber + 1 });
        parent = parents.get(parent);
      }
      return stack;
    };
    for (const sample of profile.samples ?? []) samples.set(sample, (samples.get(sample) ?? 0) + 1);
    const hotFrames = profile.nodes.filter(node => samples.has(node.id)).map(node => ({
      functionName: node.callFrame.functionName, url: node.callFrame.url, lineNumber: node.callFrame.lineNumber + 1,
      samples: samples.get(node.id),
      ancestors: ancestors(node),
    })).sort((left, right) => right.samples - left.samples).slice(0, 20);
    report.profiles.push({ phase, totalSamples: profile.samples?.length ?? 0, hotFrames });
    save();
    if (phase === 'EARLY') await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  socket.close();
  socket = null;
  report.observation = await pendingSymbols;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  socket?.close();
  await pendingSymbols;
  await resolver.dispose();
  if (previousOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previousOptions;
  assert.equal(digest(fs.readFileSync(sourcePath)), prepared.sourceRevision);
  report.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ reportPath: path.relative(root, output), status: report.observation?.result.status,
    error: report.error, profiles: report.profiles.map(profile => ({ phase: profile.phase, hotFrames: profile.hotFrames.slice(0, 3) })) }));
}
