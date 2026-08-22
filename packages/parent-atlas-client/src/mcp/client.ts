/**
 * Generic MCP (Model Context Protocol) Client
 *
 * Handles:
 * - JSON-RPC protocol over HTTP/SSE
 * - Tools discovery (tools/list)
 * - Tool execution (tools/call)
 * - Response parsing (JSON or SSE)
 * - Request/response correlation (unique JSON-RPC IDs)
 * - Proper error handling (McpTransportError on network failures)
 *
 * Does NOT import:
 * - SvelteKit
 * - Vercel AI SDK
 * - Node.js runtime specifics
 *
 * This is a low-level protocol client. Upper layers handle authorization,
 * tool allowlists, and SDK integration.
 */

import { McpTransportError } from '../errors.js';

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpClientConfig {
  url: string;
  timeout?: number; // milliseconds (default 30000)
  retryAttempts?: number; // (default 2)
}

/**
 * Generic MCP client for protocol-level operations
 *
 * NOT tied to Vercel AI SDK, SvelteKit, or any specific ecosystem.
 */
export class McpClient {
  private config: McpClientConfig;
  private requestIdCounter = 0;
  private toolListCache: { value: McpToolDescriptor[]; expiresAt: number } | undefined;
  private readonly TOOL_CACHE_TTL_MS = 60_000;

  constructor(config: McpClientConfig) {
    this.config = {
      timeout: 30_000,
      retryAttempts: 2,
      ...config
    };
  }

  /**
   * Discover available tools
   *
   * Caches results for 60 seconds. On cache miss, calls /mcp via HTTP.
   * Accepts both JSON and SSE responses (MCP Streamable HTTP).
   */
  async listTools(options?: { signal?: AbortSignal }): Promise<McpToolDescriptor[]> {
    const now = Date.now();
    if (this.toolListCache && this.toolListCache.expiresAt > now) {
      return this.toolListCache.value;
    }

    try {
      const tools = await this.callRpc('tools/list', {}, options?.signal);
      const result = (tools as { tools?: McpToolDescriptor[] }).tools ?? [];

      this.toolListCache = {
        value: result,
        expiresAt: now + this.TOOL_CACHE_TTL_MS
      };

      return result;
    } catch (error) {
      console.warn('[McpClient] tools/list failed:', error);

      // Return stale cache if available (graceful degradation)
      return this.toolListCache?.value ?? [];
    }
  }

  /**
   * Execute a tool
   *
   * Returns the tool result directly. Domain-level errors (tool returned
   * isError=true) are included in the result; only transport failures throw.
   */
  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<McpToolResult> {
    const result = await this.callRpc(
      'tools/call',
      {
        name,
        arguments: arguments_
      },
      options?.signal
    );

    return (result as McpToolResult) ?? {};
  }

  /**
   * Low-level JSON-RPC call
   *
   * Handles:
   * - Unique request ID generation
   * - HTTP POST with JSON-RPC body
   * - Response parsing (JSON or SSE)
   * - Error correlation
   * - Retry logic (on transient failures)
   */
  private async callRpc(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const id = ++this.requestIdCounter;
    const maxAttempts = this.config.retryAttempts ?? 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.config.url}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params
          }),
          signal: signal || AbortSignal.timeout(this.config.timeout ?? 30_000)
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => 'unknown error');
          const error = new McpTransportError(
            `MCP ${method} failed: HTTP ${response.status}`,
            response.status,
            detail
          );

          if (error.retryable && attempt < maxAttempts) {
            await this.backoff(attempt);
            continue;
          }

          throw error;
        }

        // Parse response (handles both JSON and SSE)
        const text = await response.text();
        const body = this.extractJsonRpcResponse(text, id);

        if (!body) {
          throw new McpTransportError(
            `MCP ${method} returned no valid JSON-RPC payload`,
            undefined,
            `content-type=${response.headers.get('content-type')}`
          );
        }

        // Check for JSON-RPC error
        if ((body as { error?: unknown }).error) {
          throw new McpTransportError(
            `MCP ${method} error: ${JSON.stringify((body as { error: unknown }).error)}`,
            undefined,
            body
          );
        }

        return (body as { result?: unknown }).result;
      } catch (error) {
        if (error instanceof McpTransportError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new McpTransportError(`MCP ${method} timeout after ${this.config.timeout}ms`, 408);
        }

        // Network or parsing error, retryable
        if (attempt < maxAttempts) {
          await this.backoff(attempt);
          continue;
        }

        throw new McpTransportError(
          `MCP ${method} failed: ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          error
        );
      }
    }

    throw new McpTransportError(`MCP ${method} exhausted ${maxAttempts} retry attempts`);
  }

  /**
   * Extract JSON-RPC response from HTTP body (JSON or SSE)
   *
   * Handles both:
   * - Inline JSON response
   * - Server-Sent Events (SSE) stream
   *
   * Returns the first message matching the request ID, or the last message
   * if no IDs match (single-response case).
   */
  private extractJsonRpcResponse(
    text: string,
    requestId: number
  ): Record<string, unknown> | null {
    // Try to parse as direct JSON first
    try {
      const parsed = JSON.parse(text);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Record<string, unknown>).jsonrpc === '2.0'
      ) {
        if ((parsed as { id?: unknown }).id === requestId || requestId === undefined) {
          return parsed as Record<string, unknown>;
        }
      }
    } catch {
      // Not direct JSON, try SSE
    }

    // Parse SSE stream
    const messages: Record<string, unknown>[] = [];
    for (const event of text.split(/\r?\n\r?\n/)) {
      const lines = event.split(/\r?\n/);
      let data = '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          data += line.replace(/^data:\s?/, '');
        }
      }

      if (!data || data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          (parsed as Record<string, unknown>).jsonrpc === '2.0'
        ) {
          messages.push(parsed as Record<string, unknown>);
        }
      } catch {
        // Skip malformed data lines
      }
    }

    // Find response matching request ID
    for (const msg of messages) {
      if ((msg as { id?: unknown }).id === requestId) {
        return msg;
      }
    }

    // No ID match: return last message (single-response fallback)
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Exponential backoff for retries
   */
  private async backoff(attempt: number): Promise<void> {
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

/**
 * Factory function
 */
export function createMcpClient(config: McpClientConfig): McpClient {
  return new McpClient(config);
}

/**
 * Type for MCP transport error
 */
export type { McpTransportError } from '../errors.js';

/**
 * Type for client error
 */
export type McpError = McpTransportError;
