/**
 * Transport Error Types
 *
 * Distinguishes between:
 * - Transport failures (network, HTTP status, protocol violation)
 * - Domain failures (expected tool-level errors)
 *
 * Consumers should:
 * - RETRY/CIRCUIT_BREAKER on TransportError
 * - PASS TO AGENT on domain error (e.g., tool returns { ok: false, code: '...' })
 */

export interface TransportErrorOptions {
  message: string;
  status?: number;
  cause?: unknown;
  retryable?: boolean;
}

/**
 * Base transport error
 *
 * Indicates a protocol or network failure, not a domain error.
 * Retry logic should apply to TransportError instances.
 */
export class TransportError extends Error {
  public readonly status?: number;
  public readonly cause?: unknown;
  public readonly retryable: boolean;

  constructor(options: TransportErrorOptions) {
    super(options.message);
    this.name = 'TransportError';
    this.status = options.status;
    this.cause = options.cause;
    this.retryable = options.retryable ?? (options.status ? options.status >= 500 : true);
  }
}

/**
 * MCP protocol error
 *
 * Indicates failure in MCP transport or protocol handling.
 * Common causes:
 * - Network unreachable (HTTP status != 2xx)
 * - Invalid JSON-RPC response
 * - MCP server crash
 * - Timeout waiting for response
 */
export class McpTransportError extends TransportError {
  constructor(
    message: string,
    status?: number,
    cause?: unknown
  ) {
    super({
      message,
      status,
      cause,
      retryable: !status || status >= 500
    });
    this.name = 'McpTransportError';
  }
}

/**
 * HTTP/REST transport error
 *
 * Indicates failure in HTTP communication with Parent Atlas service.
 */
export class HttpTransportError extends TransportError {
  constructor(
    message: string,
    status?: number,
    cause?: unknown
  ) {
    super({
      message,
      status,
      cause,
      retryable: !status || status >= 500 || status === 408 || status === 429
    });
    this.name = 'HttpTransportError';
  }
}

/**
 * gRPC transport error
 *
 * Indicates failure in gRPC communication.
 */
export class GrpcTransportError extends TransportError {
  constructor(
    message: string,
    code?: number,
    cause?: unknown
  ) {
    super({
      message,
      status: code,
      cause,
      retryable: true // gRPC errors are usually transient
    });
    this.name = 'GrpcTransportError';
  }
}

/**
 * A2A task delegation error
 *
 * Indicates failure in agent-to-agent task submission or monitoring.
 */
export class A2aTransportError extends TransportError {
  constructor(
    message: string,
    status?: number,
    cause?: unknown
  ) {
    super({
      message,
      status,
      cause,
      retryable: !status || status >= 500
    });
    this.name = 'A2aTransportError';
  }
}

/**
 * Type guard: is this error retryable?
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof TransportError) {
    return error.retryable;
  }
  return false;
}
