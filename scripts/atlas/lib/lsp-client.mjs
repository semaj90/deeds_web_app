/**
 * Minimal JSON-RPC-over-stdio LSP client, purpose-built for one-shot
 * `textDocument/documentSymbol` requests against `typescript-language-server` (already installed
 * per sveltekit-frontend's node_modules -- see CLAUDE.md's LSP Status section). Not a general
 * LSP library: only initialize / didOpen / documentSymbol / shutdown / exit are implemented,
 * because that's all graphify-symbol-extractor-v1.mts needs.
 *
 * One spawned process per call is deliberately expensive and slow compared to the in-process
 * TypeScript Compiler API walk (ts-ast-extractor.mjs) -- this is why LSP-based extraction is
 * opt-in (`--use-lsp`) rather than the default path.
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function encodeMessage(payload) {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii');
  return Buffer.concat([header, body]);
}

class LspFramedReader {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.onMessage = null;
  }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Malformed frame; drop what we have to avoid an infinite loop.
        this.buffer = Buffer.alloc(0);
        return;
      }
      const contentLength = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + contentLength) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + contentLength).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + contentLength);
      try {
        this.onMessage?.(JSON.parse(body));
      } catch {
        // Ignore unparsable frames rather than crash the whole extraction batch.
      }
    }
  }
}

/**
 * Runs a single documentSymbol request against typescript-language-server for one file's
 * content, then tears the process down. Returns the raw LSP DocumentSymbol[] (hierarchical) or
 * SymbolInformation[] (flat) response -- shape depends on server capability negotiation.
 *
 * @param {{ command: string, args: string[], languageId: string, content: string, fileUri: string, timeoutMs?: number }} input
 */
export async function requestDocumentSymbolsOnce(input) {
  const { command, args, languageId, content, fileUri, timeoutMs = 10000 } = input;

  return new Promise((resolve, reject) => {
    // Spawn the real Node entry point directly (not the .cmd/.ps1 shim). Shelling through a
    // .cmd wrapper via shell:true works, but on Windows the wrapper is itself a cmd.exe process
    // whose own child (the actual node process running the language server) survives a plain
    // child.kill() on timeout -- an orphaned tsserver process kept running detached after a
    // hung request during testing. Spawning the resolved .mjs/.js entry with `node` directly
    // avoids the wrapper layer entirely, so kill() always terminates the real process.
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const reader = new LspFramedReader();
    let nextId = 1;
    let settled = false;
    let stderrTail = '';

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`LSP_REQUEST_TIMEOUT after ${timeoutMs}ms (stderr: ${stderrTail.slice(-400)})`));
    }, timeoutMs);

    function send(payload) {
      child.stdin.write(encodeMessage(payload));
    }

    child.stderr.on('data', (chunk) => { stderrTail += chunk.toString('utf8'); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`LSP_SERVER_EXITED_BEFORE_RESPONSE:${code} (stderr: ${stderrTail.slice(-400)})`));
    });

    reader.onMessage = (message) => {
      if (message.id === 1 && message.method === undefined) {
        // initialize response -> send initialized notification, then didOpen, then request symbols.
        send({ jsonrpc: '2.0', method: 'initialized', params: {} });
        send({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: {
            textDocument: { uri: fileUri, languageId, version: 1, text: content },
          },
        });
        send({
          jsonrpc: '2.0',
          id: (nextId += 1),
          method: 'textDocument/documentSymbol',
          params: { textDocument: { uri: fileUri } },
        });
        return;
      }
      if (message.id === 2) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        send({ jsonrpc: '2.0', id: 999, method: 'shutdown', params: null });
        send({ jsonrpc: '2.0', method: 'exit', params: null });
        setTimeout(() => child.kill('SIGKILL'), 500);
        if (message.error) {
          reject(new Error(`LSP_DOCUMENT_SYMBOL_ERROR:${JSON.stringify(message.error)}`));
        } else {
          resolve(message.result ?? []);
        }
      }
    };
    child.stdout.on('data', (chunk) => reader.push(chunk));

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        processId: process.pid,
        rootUri: null,
        capabilities: {
          textDocument: { documentSymbol: { hierarchicalDocumentSymbolSupport: true } },
        },
      },
    });
  });
}

/** LSP SymbolKind (numeric) -> this repo's graphify_symbols.symbol_kind vocabulary. */
const LSP_SYMBOL_KIND_MAP = {
  5: 'class',
  6: 'method',
  8: 'field',
  9: 'constant', // Constructor -- closest existing kind, not a perfect match
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  22: 'enum', // EnumMember
  23: 'variable', // Struct
  26: 'type', // TypeParameter
};

export function mapLspSymbolKind(numericKind) {
  return LSP_SYMBOL_KIND_MAP[numericKind] ?? 'variable';
}

export function fileUriFor(absolutePath) {
  return pathToFileURL(absolutePath).toString();
}
