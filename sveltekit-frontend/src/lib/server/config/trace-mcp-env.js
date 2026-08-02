import { z } from 'zod';

const loopbackHost = '127.0.0.1';
const defaultPort = 8788;

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

export const traceMcpEnvSchema = z
  .object({
    TRACE_MCP_HOST: optionalTrimmedString,
    TRACE_MCP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    TRACE_MCP_URL: optionalTrimmedString.pipe(z.string().url()).optional(),
    DATABASE_URL: optionalTrimmedString.pipe(z.string().url()),
    REDIS_URL: optionalTrimmedString.pipe(z.string().url()).optional(),
    QDRANT_URL: optionalTrimmedString.pipe(z.string().url()).optional(),
    // A graph tool must never remain registered as healthy when its backend
    // is unconfigured — fail at MCP startup, not deep inside a tool call.
    NEO4J_URI: optionalTrimmedString.pipe(z.string().url()),
    NEO4J_USER: optionalTrimmedString.pipe(z.string().min(1)),
    NEO4J_PASSWORD: optionalTrimmedString.pipe(z.string().min(1)),
  })
  .passthrough();

export function parseTraceMcpEnv(source = process.env) {
  const result = traceMcpEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      variable: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    throw new Error(`TRACE MCP environment invalid: ${JSON.stringify(issues)}`);
  }

  const env = result.data;
  const urlFromEnv = env.TRACE_MCP_URL ? new URL(env.TRACE_MCP_URL) : null;
  const host = env.TRACE_MCP_HOST ?? urlFromEnv?.hostname ?? loopbackHost;
  const port = env.TRACE_MCP_PORT ?? (urlFromEnv?.port ? Number(urlFromEnv.port) : defaultPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`TRACE MCP environment invalid: [{"variable":"TRACE_MCP_PORT","message":"Expected integer 1-65535"}]`);
  }

  return {
    ...env,
    TRACE_MCP_HOST: host,
    TRACE_MCP_PORT: port,
    TRACE_MCP_URL: env.TRACE_MCP_URL ?? `http://${host}:${port}`,
  };
}
