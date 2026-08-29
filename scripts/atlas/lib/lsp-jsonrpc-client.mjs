/**
 * Generic JSON-RPC-over-stdio transport + protocol-lifecycle client for a Language Server
 * Protocol server. This module knows nothing about Atlas identity, byte offsets, source
 * revisions, or edge classification — that's `compiler-semantic-resolver-v1.mjs`'s job. This
 * layer only knows: spawn a server, frame/parse Content-Length messages, track request IDs,
 * time out, and offer thin convenience wrappers for the handful of LSP lifecycle methods every
 * caller needs (`initialize`, `didOpen`, `didClose`, `shutdown`).
 *
 * Extracted 2026-08-29 from `prove-typescript-lsp-readonly.mjs` and
 * `prove-svelte-language-server-readonly.mjs` so those two proof scripts and the
 * compiler-semantic resolver (see
 * openspec/changes/parent-atlas-compiler-semantic-graph-resolution) share one transport
 * implementation instead of duplicating it.
 *
 * `useShellWrapper` intentionally defaults to a platform check but accepts an explicit override
 * so an existing caller's behavior (svelte-language-server's proof always wraps in cmd.exe, even
 * off Windows) can be preserved byte-for-byte during extraction rather than silently "fixed" as a
 * side effect of this refactor.
 */

import { spawn } from 'node:child_process';

export function spawnLspServer({ command, args = [], cwd, useShellWrapper = process.platform === 'win32' }) {
  const processHandle = useShellWrapper
    ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    : spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

  let buffer = Buffer.alloc(0);
  let nextId = 1;
  let stderr = '';
  let openedFiles = 0;
  const pending = new Map();

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

  function send(message) {
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    processHandle.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    processHandle.stdin.write(body);
  }

  function request(method, params, timeoutMs = 15000) {
    const id = nextId++;
    send({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`LSP_TIMEOUT:${method}`)); }, timeoutMs);
      pending.set(id, (message) => { clearTimeout(timer); pending.delete(id); resolveRequest(message); });
    });
  }

  function notify(method, params) { send({ jsonrpc: '2.0', method, params }); }

  // Thin lifecycle convenience wrappers — still generic LSP, not Atlas-specific.
  async function initialize(params, timeoutMs = 15000) {
    const result = await request('initialize', params, timeoutMs);
    notify('initialized', {});
    return result;
  }

  function didOpen({ uri, languageId, text, version = 1 }) {
    openedFiles += 1;
    notify('textDocument/didOpen', { textDocument: { uri, languageId, version, text } });
  }

  function didClose({ uri }) {
    notify('textDocument/didClose', { textDocument: { uri } });
  }

  async function shutdown(timeoutMs = 2000) {
    try { await request('shutdown', null, timeoutMs); } catch { /* preserve caller's primary result */ }
    notify('exit', null);
  }

  async function dispose() {
    await shutdown();
    processHandle.stdin.end();
    setTimeout(() => processHandle.kill(), 1000).unref();
  }

  return {
    request, notify, initialize, didOpen, didClose, shutdown, dispose,
    getStderr: () => stderr,
    getOpenedFileCount: () => openedFiles,
    processHandle,
  };
}

export function positionAt(text, needle) {
  const offset = text.indexOf(needle);
  if (offset < 0) throw new Error(`LSP_PROBE_SYMBOL_MISSING:${needle}`);
  const before = text.slice(0, offset);
  return { line: before.split('\n').length - 1, character: before.slice(before.lastIndexOf('\n') + 1).length };
}

/**
 * Converts a UTF-8 byte offset (the coordinate tree-sitter/the 8095 sidecar emits) into an
 * LSP position (UTF-16 code-unit line/character, LSP's default `positionEncoding`). Naively
 * treating byteOffset as a character index is wrong for any source containing multibyte UTF-8
 * sequences (non-ASCII identifiers, comments, string literals). This decodes the exact byte
 * prefix as UTF-8 and measures its UTF-16 length via the JS string it produces, since JS strings
 * are natively UTF-16 code units.
 */
export function byteOffsetToPosition(sourceBuffer, byteOffset) {
  if (byteOffset < 0 || byteOffset > sourceBuffer.length) {
    throw new Error(`LSP_BYTE_OFFSET_OUT_OF_RANGE:${byteOffset}:${sourceBuffer.length}`);
  }
  const prefix = sourceBuffer.subarray(0, byteOffset).toString('utf8');
  const lastNewline = prefix.lastIndexOf('\n');
  return {
    line: (prefix.match(/\n/g) ?? []).length,
    character: lastNewline < 0 ? prefix.length : prefix.length - lastNewline - 1,
  };
}
