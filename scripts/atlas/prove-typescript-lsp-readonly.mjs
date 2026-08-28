import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = resolve(repoRoot, 'sveltekit-frontend');
const sourcePath = resolve(frontendRoot, 'src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts');
const source = await readFile(sourcePath, 'utf8');
const sourceRef = relative(frontendRoot, sourcePath).replaceAll('\\', '/');
const uri = pathToFileURL(sourcePath).href;
const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
const command = resolve(frontendRoot, 'node_modules/.bin/typescript-language-server.cmd');
const reportPath = resolve(repoRoot, 'docs/reports/typescript-lsp-readonly-proof-v1.json');

const processHandle = process.platform === 'win32'
  ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${command} --stdio`], { cwd: frontendRoot, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  : spawn(command, ['--stdio'], { cwd: frontendRoot, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let buffer = Buffer.alloc(0);
const pending = new Map();
let stderr = '';
processHandle.stderr.on('data', (data) => { stderr += data.toString(); });
processHandle.stdout.on('data', (data) => {
  buffer = Buffer.concat([buffer, data]);
  while (true) {
    const separator = buffer.indexOf('\r\n\r\n');
    if (separator < 0) break;
    const header = buffer.subarray(0, separator).toString('ascii');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error('LSP_CONTENT_LENGTH_MISSING');
    const length = Number(match[1]);
    const start = separator + 4;
    if (buffer.length < start + length) break;
    const message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
    buffer = buffer.subarray(start + length);
    if (message.id !== undefined) pending.get(message.id)?.(message);
  }
});

let nextId = 1;
function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  processHandle.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  processHandle.stdin.write(body);
}
function request(method, params) {
  const id = nextId++;
  send({ jsonrpc: '2.0', id, method, params });
  return new Promise((resolveRequest, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`LSP_TIMEOUT:${method}`)); }, 15000);
    pending.set(id, (message) => { clearTimeout(timer); pending.delete(id); resolveRequest(message); });
  });
}
function notify(method, params) { send({ jsonrpc: '2.0', method, params }); }
function positionAt(text, needle) {
  const offset = text.indexOf(needle);
  if (offset < 0) throw new Error(`LSP_PROBE_SYMBOL_MISSING:${needle}`);
  const before = text.slice(0, offset);
  return { line: before.split('\n').length - 1, character: before.slice(before.lastIndexOf('\n') + 1).length };
}

const probeSymbol = 'createNodeTreeSitterAstProvider';
const position = positionAt(source, probeSymbol);
let status = 'FAILED';
let initializeResult = null;
let definitionResult = null;
let error = null;
try {
  initializeResult = await request('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(frontendRoot).href,
    workspaceFolders: [{ uri: pathToFileURL(frontendRoot).href, name: 'sveltekit-frontend' }],
    capabilities: { general: { positionEncodings: ['utf-8', 'utf-16', 'utf-32'] } },
    clientInfo: { name: 'parent-atlas-readonly-proof', version: '1' },
  });
  notify('initialized', {});
  notify('textDocument/didOpen', { textDocument: { uri, languageId: 'typescript', version: 1, text: source } });
  definitionResult = await request('textDocument/definition', {
    textDocument: { uri }, position,
  });
  status = definitionResult.error ? 'DEGRADED_LSP_RESPONSE' : 'PROVEN_READ_ONLY';
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  try { await request('shutdown', null); } catch { /* preserve primary probe result */ }
  notify('exit', null);
  processHandle.stdin.end();
  setTimeout(() => processHandle.kill(), 1000).unref();
}

const report = {
  schema: 'atlas.typescript-lsp-readonly-proof.v1', status, writes: false,
  server: { id: 'typescript-language-server', version: '5.3.0', command },
  sourceRef, sourceRevision, probeSymbol, position,
  clientOfferedPositionEncodings: ['utf-8', 'utf-16', 'utf-32'],
  negotiatedPositionEncoding: initializeResult?.result?.capabilities?.positionEncoding ?? 'utf-16-default',
  positionEncodingExplicitlyReturned: Boolean(initializeResult?.result?.capabilities?.positionEncoding),
  initializeError: initializeResult?.error ?? null,
  definitionError: definitionResult?.error ?? null,
  definitionCount: Array.isArray(definitionResult?.result) ? definitionResult.result.length : definitionResult?.result ? 1 : 0,
  stderr: stderr.trim() || null, error,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status, sourceRef, definitionCount: report.definitionCount, report: reportPath }, null, 2));
if (status === 'FAILED') process.exitCode = 1;
