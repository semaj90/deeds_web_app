import assert from 'node:assert/strict';
import test from 'node:test';
import { byteOffsetToPosition, positionToByteOffset, spawnLspServer } from './lsp-jsonrpc-client.mjs';

test('UTF-16 LSP positions map to UTF-8 byte offsets across Unicode and CRLF', () => {
  const source = Buffer.from('const title = "é😀";\r\nrun();\r\n', 'utf8');
  const target = source.indexOf(Buffer.from('run();'));
  assert.equal(positionToByteOffset(source, { line: 1, character: 0 }), target);
  assert.deepEqual(byteOffsetToPosition(source, target), { line: 1, character: 0 });
  const lineEnd = 'const title = "é😀";'.length;
  assert.equal(positionToByteOffset(source, { line: 0, character: lineEnd }), source.indexOf(Buffer.from('\r\n')));
});

test('UTF-16 mapping rejects positions inside surrogate pairs and invalid ranges', () => {
  const source = Buffer.from('a😀b\n', 'utf8');
  assert.throws(() => positionToByteOffset(source, { line: 0, character: 2 }), /LSP_POSITION_SPLITS_UTF16_SURROGATE/);
  assert.throws(() => positionToByteOffset(source, { line: 2, character: 0 }), /LSP_LINE_OUT_OF_RANGE/);
  assert.throws(() => positionToByteOffset(source, { line: 0, character: 5 }), /LSP_CHARACTER_OUT_OF_RANGE/);
});

test('server requests receive configuration and cannot resolve client requests with the same ID', async () => {
  const server = `
    let buffer = Buffer.alloc(0), initializeId, documentId;
    const send = message => { const body = Buffer.from(JSON.stringify(message)); process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n'); process.stdout.write(body); };
    process.stdin.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const separator = buffer.indexOf('\\r\\n\\r\\n'); if (separator < 0) return;
        const length = Number(buffer.subarray(0, separator).toString().match(/Content-Length: (\\d+)/)[1]);
        if (buffer.length < separator + 4 + length) return;
        const message = JSON.parse(buffer.subarray(separator + 4, separator + 4 + length)); buffer = buffer.subarray(separator + 4 + length);
        if (message.method === 'initialize') { initializeId = message.id; send({ jsonrpc: '2.0', id: initializeId, method: 'workspace/configuration', params: { items: [{ section: 'svelte.plugin.typescript.enable' }] } }); }
        else if (!message.method && message.id === initializeId) { if (message.result?.[0] !== true) process.exit(2); send({ jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3, message: 'project ready' } }); send({ jsonrpc: '2.0', id: initializeId, result: { capabilities: { documentSymbolProvider: true } } }); initializeId = null; }
        else if (message.method === 'textDocument/documentSymbol') { documentId = message.id; send({ jsonrpc: '2.0', id: documentId, method: 'workspace/applyEdit', params: { edit: {} } }); }
        else if (!message.method && message.id === documentId) { if (message.result?.applied !== false) process.exit(3); send({ jsonrpc: '2.0', id: documentId, result: [{ name: 'verified' }] }); documentId = null; }
        else if (message.method === 'shutdown') send({ jsonrpc: '2.0', id: message.id, result: null });
        else if (message.method === 'exit') process.exit(0);
      }
    });`;
  const client = spawnLspServer({ command: process.execPath, args: ['--input-type=module', '-e', server], cwd: process.cwd(), useShellWrapper: false });
  try {
    const initialized = await client.initialize({ initializationOptions: { configuration: { svelte: { plugin: { typescript: { enable: true } } } } } }, 5000);
    assert.equal(initialized.result.capabilities.documentSymbolProvider, true);
    const symbols = await client.request('textDocument/documentSymbol', { textDocument: { uri: 'file:///fixture.svelte' } }, 5000);
    assert.deepEqual(symbols.result, [{ name: 'verified' }]);
    assert.deepEqual(client.getObservedServerRequests(), [{ method: 'workspace/configuration' }, { method: 'workspace/applyEdit' }]);
    assert.deepEqual(client.getObservedNotifications(), [{ method: 'window/logMessage', type: 3, message: 'project ready' }]);
  } finally { await client.dispose(); }
});
