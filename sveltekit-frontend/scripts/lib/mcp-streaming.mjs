/**
 * mcp-streaming.mjs
 *
 * MCP transport helpers for streaming JSON-RPC 2.0 over multiple mediums:
 *   - Stdio (default, no SDK needed)
 *   - Streamable HTTP (optional)
 *   - Valkey :stream (Redis Streams, for event pub/sub)
 *
 * NO SDK REQUIRED. Pure JSON-RPC 2.0 protocol implementation.
 *
 * Usage:
 *   const transport = new StdioJsonRpc2Transport();
 *   await transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
 *   transport.on('message', (msg) => console.log(msg));
 */

import readline from 'readline';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// ── Stdio JSON-RPC 2.0 Transport ──────────────────────────────────────────

export class StdioJsonRpc2Transport extends EventEmitter {
  constructor() {
    super();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        this.emit('message', msg);
      } catch (err) {
        console.error(`[ERROR] Invalid JSON: ${err.message}`);
      }
    });

    this.rl.on('close', () => {
      this.emit('close');
    });
  }

  async send(msg) {
    return new Promise((resolve, reject) => {
      const json = JSON.stringify(msg);
      process.stdout.write(json + '\n', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close() {
    this.rl.close();
  }
}

// ── Streamable HTTP Transport (Optional) ──────────────────────────────────

export class StreamableHttpTransport extends EventEmitter {
  /**
   * HTTP transport for MCP tools (optional enhancement).
   * Streams responses as JSONL (one JSON object per line).
   *
   * Usage:
   *   const server = express();
   *   const transport = new StreamableHttpTransport();
   *   server.post('/mcp', transport.handleRequest.bind(transport));
   */

  constructor() {
    super();
    this.requestId = 0;
  }

  /**
   * Express middleware for /mcp endpoint.
   * Reads request body as JSONL, processes each message, streams responses.
   */
  async handleRequest(req, res) {
    res.setHeader('Content-Type', 'application/jsonl');
    res.setHeader('Transfer-Encoding', 'chunked');

    const messages = [];
    let buffer = '';

    req.setEncoding('utf8');

    // Collect request body
    for await (const chunk of req) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        if (line.trim()) {
          try {
            messages.push(JSON.parse(line));
          } catch (err) {
            res.write(
              JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32700, message: 'Parse error' },
              }) + '\n'
            );
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        messages.push(JSON.parse(buffer));
      } catch (err) {
        res.write(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
          }) + '\n'
        );
      }
    }

    // Process messages and stream responses
    for (const msg of messages) {
      const response = await this.dispatchMessage(msg);
      res.write(JSON.stringify(response) + '\n');
    }

    res.end();
  }

  async dispatchMessage(msg) {
    // Override in subclass or wire to tool handlers
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Method not found' },
    };
  }
}

// ── Valkey Stream Transport ────────────────────────────────────────────────

export class ValkeyStreamTransport extends EventEmitter {
  /**
   * Valkey :stream transport for event-driven MCP.
   * Publishes tool results to Redis streams for real-time subscriber updates.
   *
   * Usage:
   *   const transport = new ValkeyStreamTransport(redis);
   *   await transport.publishToolResult('my-tool-name', { data: 'result' });
   */

  constructor(redis) {
    super();
    this.redis = redis;
    this.streamKey = 'mcp:results';
  }

  /**
   * Publish tool result to Valkey stream.
   * @param {string} toolName Tool that produced the result
   * @param {object} result Tool result
   * @param {object} metadata Optional metadata { requestId, timestamp, etc. }
   */
  async publishToolResult(toolName, result, metadata = {}) {
    if (!this.redis) return null;

    try {
      const fields = [
        'tool_name', toolName,
        'result', JSON.stringify(result),
        'timestamp', new Date().toISOString(),
        'request_id', metadata.requestId || crypto.randomUUID().slice(0, 8),
      ];

      // Add optional metadata fields
      if (metadata.duration_ms) {
        fields.push('duration_ms', String(metadata.duration_ms));
      }
      if (metadata.cache_hit) {
        fields.push('cache_hit', metadata.cache_hit ? 'true' : 'false');
      }
      if (metadata.source) {
        fields.push('source', metadata.source);
      }

      const messageId = await this.redis.xadd(this.streamKey, '*', ...fields);
      return { status: 'published', streamKey: this.streamKey, messageId };
    } catch (err) {
      console.warn(`[WARN] Stream publish failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Subscribe to tool results via stream (async generator).
   * @param {string} startId Stream position ('$' for new, '0-0' for all)
   */
  async *subscribeToResults(startId = '$') {
    if (!this.redis) return;

    let lastId = startId;

    while (true) {
      try {
        // XREAD BLOCK: wait indefinitely for new messages
        const messages = await this.redis.xread(
          'BLOCK', 0,
          'STREAMS', this.streamKey, lastId
        );

        if (messages && messages.length > 0) {
          const [stream, entries] = messages[0];
          for (const [id, fields] of entries) {
            const event = {};
            for (let i = 0; i < fields.length; i += 2) {
              event[fields[i]] = fields[i + 1];
            }

            // Parse JSON fields
            if (event.result) {
              try {
                event.result = JSON.parse(event.result);
              } catch {
                // Leave as string if parsing fails
              }
            }

            lastId = id;
            yield { id, event };
          }
        }
      } catch (err) {
        console.error(`[ERROR] Stream subscription failed: ${err.message}`);
        break;
      }
    }
  }

  /**
   * Clear stream (for testing/cleanup).
   */
  async clearStream() {
    if (!this.redis) return null;
    return await this.redis.del(this.streamKey);
  }
}

// ── Hybrid Transport (stdio default + optional HTTP/Stream) ────────────────

export class HybridMcpTransport extends EventEmitter {
  /**
   * Hybrid transport: stdio (primary) + Streamable HTTP (optional) + Valkey stream (optional).
   *
   * Automatically routes based on connection type:
   *   - Node subprocess: stdio JSON-RPC 2.0
   *   - HTTP request: Streamable HTTP (JSONL response)
   *   - Redis available: Valkey :stream publishing
   */

  constructor(options = {}) {
    super();
    this.options = options;
    this.stdio = new StdioJsonRpc2Transport();
    this.http = new StreamableHttpTransport();
    this.redis = options.redis ? new ValkeyStreamTransport(options.redis) : null;

    // Wire stdio events
    this.stdio.on('message', (msg) => {
      this.emit('message', msg);
    });
    this.stdio.on('close', () => {
      this.emit('close');
    });
  }

  async send(msg, transport = 'stdio') {
    if (transport === 'stdio') {
      return this.stdio.send(msg);
    } else if (transport === 'http') {
      // HTTP transport handled by handleRequest()
      return null;
    }
  }

  async publishResult(toolName, result, metadata = {}) {
    if (this.redis) {
      return this.redis.publishToolResult(toolName, result, metadata);
    }
    return null;
  }

  close() {
    this.stdio.close();
  }
}

// ── Tool Handler Base Class ────────────────────────────────────────────────

export class McpToolHandler extends EventEmitter {
  /**
   * Base class for MCP tool handlers.
   * Defines a single tool and its execution logic.
   */

  constructor(name, description, inputSchema) {
    super();
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
  }

  /**
   * Execute tool with input arguments.
   * Override in subclass.
   */
  async execute(args) {
    throw new Error('execute() not implemented');
  }

  /**
   * Serialize for tools/list response.
   */
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}

// ── Tool Registry ─────────────────────────────────────────────────────────

export class McpToolRegistry {
  /**
   * Registry of available MCP tools.
   * Handles tools/list and tools/call dispatching.
   */

  constructor() {
    this.tools = new Map();
  }

  register(handler) {
    if (!(handler instanceof McpToolHandler)) {
      throw new Error('Handler must extend McpToolHandler');
    }
    this.tools.set(handler.name, handler);
  }

  list() {
    return Array.from(this.tools.values()).map((h) => h.toJSON());
  }

  async call(toolName, args) {
    const handler = this.tools.get(toolName);
    if (!handler) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    return handler.execute(args);
  }
}

// ── JSON-RPC 2.0 Server ───────────────────────────────────────────────────

export class JsonRpc2Server {
  /**
   * Simple JSON-RPC 2.0 server.
   * Handles initialize, tools/list, tools/call.
   */

  constructor(serverName = 'mcp-server', registry = new McpToolRegistry()) {
    this.serverName = serverName;
    this.registry = registry;
    this.transport = new StdioJsonRpc2Transport();

    this.transport.on('message', (msg) => this.handleMessage(msg));
    this.transport.on('close', () => {
      console.log('[OK] Server shutting down');
      process.exit(0);
    });
  }

  async handleMessage(msg) {
    let response = {
      jsonrpc: '2.0',
      id: msg.id,
    };

    try {
      if (msg.method === 'initialize') {
        response.result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: this.serverName,
            version: '1.0.0',
          },
        };
      } else if (msg.method === 'tools/list') {
        response.result = { tools: this.registry.list() };
      } else if (msg.method === 'tools/call') {
        const { name, arguments: args } = msg.params;
        const result = await this.registry.call(name, args);
        response.result = {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } else {
        response.error = {
          code: -32601,
          message: 'Method not found',
        };
      }
    } catch (err) {
      response.error = {
        code: -32603,
        message: err.message,
      };
    }

    await this.transport.send(response);
  }

  close() {
    this.transport.close();
  }
}

export default {
  StdioJsonRpc2Transport,
  StreamableHttpTransport,
  ValkeyStreamTransport,
  HybridMcpTransport,
  McpToolHandler,
  McpToolRegistry,
  JsonRpc2Server,
};
