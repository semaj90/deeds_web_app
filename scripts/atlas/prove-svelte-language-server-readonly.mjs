import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const frontend = resolve(root, 'sveltekit-frontend');
const sourcePath = resolve(root, 'sveltekit-frontend/src/lib/client/ui/POIPhotoModal.svelte');
const source = await readFile(sourcePath, 'utf8');
const sourceRef = relative(root, sourcePath).replaceAll('\\', '/');
const uri = pathToFileURL(sourcePath).href;
const command = resolve(frontend, 'node_modules/.bin/svelteserver.cmd');
const reportPath = resolve(root, 'docs/reports/svelte-language-server-readonly-proof-v1.json');
const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
const processHandle = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${command} --stdio`], { cwd: frontend, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let buffer = Buffer.alloc(0); let nextId = 1; let stderr = '';
const pending = new Map();
processHandle.stderr.on('data', (data) => { stderr += data.toString(); });
processHandle.stdout.on('data', (data) => {
  buffer = Buffer.concat([buffer, data]);
  while (true) {
    const separator = buffer.indexOf('\r\n\r\n'); if (separator < 0) break;
    const header = buffer.subarray(0, separator).toString('ascii'); const match = header.match(/Content-Length:\s*(\d+)/i); if (!match) throw new Error('LSP_CONTENT_LENGTH_MISSING');
    const start = separator + 4; const length = Number(match[1]); if (buffer.length < start + length) break;
    const message = JSON.parse(buffer.subarray(start, start + length).toString('utf8')); buffer = buffer.subarray(start + length);
    if (message.id !== undefined) pending.get(message.id)?.(message);
  }
});
function send(message) { const body = Buffer.from(JSON.stringify(message), 'utf8'); processHandle.stdin.write(`Content-Length: ${body.length}\r\n\r\n`); processHandle.stdin.write(body); }
function request(method, params) { const id = nextId++; send({ jsonrpc: '2.0', id, method, params }); return new Promise((resolveRequest, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error(`LSP_TIMEOUT:${method}`)); }, 60000); pending.set(id, (message) => { clearTimeout(timer); pending.delete(id); resolveRequest(message); }); }); }
function notify(method, params) { send({ jsonrpc: '2.0', method, params }); }
function positionAt(text, needle) { const offset = text.indexOf(needle); if (offset < 0) throw new Error(`SVELTE_LSP_PROBE_SYMBOL_MISSING:${needle}`); const before = text.slice(0, offset); return { line: before.split('\n').length - 1, character: before.slice(before.lastIndexOf('\n') + 1).length }; }

const probeSymbol = 'POIPhotoModalImpl'; const position = positionAt(source, probeSymbol); let status = 'FAILED'; let initializeResult = null; let hoverResult = null; let definitionResult = null; let error = null;
try {
  initializeResult = await request('initialize', { processId: process.pid, rootUri: pathToFileURL(frontend).href, workspaceFolders: [{ uri: pathToFileURL(frontend).href, name: 'sveltekit-frontend' }], capabilities: { general: { positionEncodings: ['utf-8', 'utf-16', 'utf-32'] } }, clientInfo: { name: 'parent-atlas-svelte-lsp-proof', version: '1' } });
  notify('initialized', {}); notify('textDocument/didOpen', { textDocument: { uri, languageId: 'svelte', version: 1, text: source } }); await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
  hoverResult = await request('textDocument/hover', { textDocument: { uri }, position });
  definitionResult = await request('textDocument/definition', { textDocument: { uri }, position });
  status = hoverResult.error || definitionResult.error ? 'DEGRADED_LSP_RESPONSE' : 'PROVEN_LIVE_READ_ONLY';
} catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
finally { try { await request('shutdown', null); } catch {} notify('exit', null); processHandle.stdin.end(); setTimeout(() => processHandle.kill(), 1000).unref(); }

const report = { schema: 'atlas.svelte-language-server-readonly-proof.v1', status, writes: false, server: { id: 'svelte-language-server', version: '0.18.3', command }, sourceRef, sourceRevision, probeSymbol, position, negotiatedPositionEncoding: initializeResult?.result?.capabilities?.positionEncoding ?? 'utf-16-default', serverCapabilities: initializeResult?.result?.capabilities ?? null, hoverPresent: Boolean(hoverResult?.result), definitionCount: Array.isArray(definitionResult?.result) ? definitionResult.result.length : definitionResult?.result ? 1 : 0, initializeError: initializeResult?.error ?? null, hoverError: hoverResult?.error ?? null, definitionError: definitionResult?.error ?? null, stderr: stderr.trim() || null, error };
await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ status, sourceRef, definitionCount: report.definitionCount, report: reportPath }, null, 2)); if (status === 'FAILED') process.exitCode = 1;
