#!/usr/bin/env node

/**
 * Parent Atlas multicore MCP server.
 *
 * Transport:
 *   MCP stdio for Cline, OpenCode, Claude Code, and other MCP clients.
 *
 * Safety:
 *   - confines file operations to the repository
 *   - allows only predefined validation commands
 *   - uses subprocess timeouts
 *   - limits output and file sizes
 *   - writes tool-call receipts before returning results
 *   - never writes protocol diagnostics to stdout
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const SERVER_NAME = 'parent-atlas-multicore';
const SERVER_VERSION = '2.0.0';

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);

const APP_ROOT = path.resolve(process.env.PARENT_ATLAS_APP_ROOT ?? path.join(SCRIPT_DIR, '..'));

const REPO_ROOT = path.resolve(process.env.PARENT_ATLAS_REPO_ROOT ?? path.join(APP_ROOT, '..'));

const LOG_DIR = path.resolve(
  process.env.PARENT_ATLAS_MCP_LOG_DIR ?? path.join(APP_ROOT, 'logs', 'mcp')
);

const RECEIPT_PATH = path.join(LOG_DIR, 'multicore-tool-receipts.ndjson');

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256_000;
const MAX_FILE_BYTES = 512_000;
const MAX_SEARCH_RESULTS = 200;

const serviceEndpoints = {
  qdrant: process.env.QDRANT_URL ?? 'http://127.0.0.1:6333',

  embedding: process.env.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081',

  synthesis: process.env.LLM_SERVER_URL ?? 'http://127.0.0.1:8090',

  nlp: process.env.NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095',

  sveltekit: process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173',
};

const validationCommands = {
  type: {
    command: 'npm',
    args: ['run', 'check'],
  },

  lint: {
    command: 'npm',
    args: ['run', 'lint'],
  },

  build: {
    command: 'npm',
    args: ['run', 'build'],
  },

  scripts: {
    command: 'npm',
    args: ['run', 'check:scripts:stable'],
  },

  packet_contract: {
    command: 'npm',
    args: ['run', 'atlas:smoke:packet-contract'],
  },

  embedding: {
    command: 'npm',
    args: ['run', 'smoke:embeddinggemma'],
  },
};

function sha256(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function normalizeTimeout(value) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(MAX_TIMEOUT_MS, Math.max(1_000, Math.trunc(parsed)));
}

function resolveWithinRepository(candidate = '.') {
  const resolved = path.resolve(REPO_ROOT, candidate);
  const relative = path.relative(REPO_ROOT, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`PATH_OUTSIDE_REPOSITORY: ${candidate}`);
  }

  return resolved;
}

function truncateText(value, maxBytes = MAX_OUTPUT_BYTES) {
  const buffer = Buffer.from(String(value), 'utf8');

  if (buffer.byteLength <= maxBytes) {
    return {
      text: buffer.toString('utf8'),
      truncated: false,
    };
  }

  return {
    text: buffer.subarray(0, maxBytes).toString('utf8'),

    truncated: true,
  };
}

function createToolResponse(payload, isError = false) {
  return {
    isError,

    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function runCommand(
  command,
  args,
  { cwd = APP_ROOT, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputBytes = MAX_OUTPUT_BYTES } = {}
) {
  const timeout = normalizeTimeout(timeoutMs);

  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);

    let timedOut = false;
    let outputLimitExceeded = false;
    let completed = false;

    const finish = (result) => {
      if (completed) {
        return;
      }

      completed = true;
      resolve(result);
    };

    const collect = (current, chunk) => {
      const next = Buffer.concat([current, Buffer.from(chunk)]);

      if (next.byteLength > maxOutputBytes) {
        outputLimitExceeded = true;

        try {
          child.kill();
        } catch {
          // Ignore termination races.
        }

        return next.subarray(0, maxOutputBytes);
      }

      return next;
    };

    child.stdout.on('data', (chunk) => {
      stdout = collect(stdout, chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr = collect(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;

      try {
        child.kill();
      } catch {
        // Ignore termination races.
      }
    }, timeout);

    child.on('error', (error) => {
      clearTimeout(timer);

      finish({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut,
        outputLimitExceeded,

        stdout: stdout.toString('utf8'),

        stderr: [stderr.toString('utf8'), error.message].filter(Boolean).join('\n'),
      });
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);

      finish({
        ok: exitCode === 0 && !timedOut && !outputLimitExceeded,

        exitCode,
        signal,
        timedOut,
        outputLimitExceeded,

        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
      });
    });
  });
}

async function fetchWithTimeout(url, timeoutMs = 5_000) {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(normalizeTimeout(timeoutMs)),
    });

    const rawBody = await response.text();
    const boundedBody = truncateText(rawBody, 32_000);

    return {
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      body: boundedBody.text,
      truncated: boundedBody.truncated,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      duration_ms: Date.now() - startedAt,

      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function writeReceipt({ callId, toolName, input, status, startedAt, output, errorCode }) {
  await mkdir(LOG_DIR, {
    recursive: true,
  });

  const receipt = {
    schema_version: 'atlas.tool-call-receipt.v1',

    call_id: callId,
    tool_name: toolName,
    tool_version: SERVER_VERSION,

    input_digest: sha256(input),

    output_digest: output === undefined ? null : sha256(output),

    started_at: new Date(startedAt).toISOString(),

    ended_at: new Date().toISOString(),

    duration_ms: Date.now() - startedAt,

    status,

    error_code: errorCode ?? null,

    compact_summary: output?.summary ?? output?.message ?? `${toolName} ${status}`,
  };

  await appendFile(RECEIPT_PATH, `${JSON.stringify(receipt)}\n`, 'utf8');

  return receipt;
}

async function executeTool(toolName, input, implementation) {
  const callId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const output = await implementation();

    const status = output?.status ?? 'PASS';

    const receipt = await writeReceipt({
      callId,
      toolName,
      input,
      status,
      startedAt,
      output,
    });

    return createToolResponse({
      ...output,

      receipt: {
        call_id: receipt.call_id,
        result_log: RECEIPT_PATH,
        duration_ms: receipt.duration_ms,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const errorCode = message.includes(':') ? message.split(':', 1)[0] : 'TOOL_FAILED';

    const receipt = await writeReceipt({
      callId,
      toolName,
      input,
      status: 'FAIL',
      startedAt,

      output: {
        message,
      },

      errorCode,
    });

    return createToolResponse(
      {
        status: 'FAIL',
        error_code: errorCode,
        message,

        receipt: {
          call_id: receipt.call_id,
          result_log: RECEIPT_PATH,
          duration_ms: receipt.duration_ms,
        },
      },
      true
    );
  }
}

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

/**
 * Search the repository using ripgrep.
 */
server.registerTool(
  'search_codebase',
  {
    title: 'Search Parent Atlas Codebase',

    description: 'Run a bounded ripgrep search inside the Parent Atlas repository.',

    inputSchema: {
      query: z.string().min(1).max(500),

      search_path: z.string().default('.'),

      glob: z.string().max(200).optional(),

      max_results: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(50),

      timeout_ms: z.number().int().min(1_000).max(30_000).default(10_000),
    },
  },

  async (input) =>
    executeTool(
      'search_codebase',
      input,

      async () => {
        const searchRoot = resolveWithinRepository(input.search_path);

        const args = [
          '--line-number',
          '--column',
          '--no-heading',
          '--color',
          'never',
          '--hidden',

          '--glob',
          '!node_modules/**',

          '--glob',
          '!.git/**',
        ];

        if (input.glob) {
          args.push('--glob', input.glob);
        }

        args.push('--', input.query, searchRoot);

        const result = await runCommand('rg', args, {
          cwd: REPO_ROOT,
          timeoutMs: input.timeout_ms,
        });

        const matches = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, input.max_results);

        const normalNoMatch =
          result.exitCode === 1 && !result.timedOut && !result.outputLimitExceeded;

        return {
          status: result.ok || normalNoMatch ? 'PASS' : 'FAIL',

          summary: `Found ${matches.length} bounded code matches.`,

          match_count: matches.length,

          matches,

          stderr: result.stderr || undefined,

          timed_out: result.timedOut,

          output_limited: result.outputLimitExceeded,
        };
      }
    )
);

/**
 * Read and deterministically inspect one source file.
 */
server.registerTool(
  'analyze_code',
  {
    title: 'Analyze a Source File',

    description:
      'Read a bounded repository file and return deterministic imports, symbols, and issue hints.',

    inputSchema: {
      file_path: z.string().min(1),

      analysis_type: z
        .enum(['structure', 'imports', 'symbols', 'issues', 'content'])
        .default('structure'),

      max_bytes: z.number().int().min(1_024).max(MAX_FILE_BYTES).default(128_000),
    },
  },

  async (input) =>
    executeTool(
      'analyze_code',
      input,

      async () => {
        const filePath = resolveWithinRepository(input.file_path);

        const fileInfo = await stat(filePath);

        if (!fileInfo.isFile()) {
          throw new Error('NOT_A_FILE');
        }

        const bytes = await readFile(filePath);

        const selected = bytes.subarray(0, Math.min(bytes.byteLength, input.max_bytes));

        const content = selected.toString('utf8');

        const lines = content.split(/\r?\n/);

        const imports = lines
          .map((line, index) => ({
            line: index + 1,
            text: line.trim(),
          }))
          .filter(({ text }) => /^(import\b|export .* from\b|const .*require\()/.test(text))
          .slice(0, 100);

        const symbols = lines
          .map((line, index) => ({
            line: index + 1,
            text: line.trim(),
          }))
          .filter(({ text }) =>
            /^(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum)\s+/.test(
              text
            )
          )
          .slice(0, 200);

        const issueHints = lines
          .map((line, index) => ({
            line: index + 1,
            text: line.trim(),
          }))
          .filter(({ text }) =>
            /\b(TODO|FIXME|HACK|XXX|execSync|shell:\s*true|eval\(|child_process)\b/.test(text)
          )
          .slice(0, 100);

        const base = {
          status: 'PASS',

          summary: `Analyzed ${path.relative(REPO_ROOT, filePath)} deterministically.`,

          file_path: path.relative(REPO_ROOT, filePath),

          size_bytes: fileInfo.size,

          bytes_read: selected.byteLength,

          truncated: selected.byteLength < bytes.byteLength,

          line_count_read: lines.length,

          content_digest: sha256(bytes),
        };

        switch (input.analysis_type) {
          case 'imports':
            return {
              ...base,
              imports,
            };

          case 'symbols':
            return {
              ...base,
              symbols,
            };

          case 'issues':
            return {
              ...base,
              issue_hints: issueHints,
            };

          case 'content':
            return {
              ...base,
              content,
            };

          case 'structure':
          default:
            return {
              ...base,
              imports,
              symbols,
              issue_hints: issueHints,
            };
        }
      }
    )
);

/**
 * Validate JSON or JavaScript syntax.
 */
server.registerTool(
  'validate_config',
  {
    title: 'Validate a Configuration File',

    description:
      'Validate JSON directly or run a bounded Node syntax check for JavaScript modules.',

    inputSchema: {
      config_path: z.string().min(1),

      config_type: z.enum(['json', 'javascript', 'auto']).default('auto'),
    },
  },

  async (input) =>
    executeTool(
      'validate_config',
      input,

      async () => {
        const filePath = resolveWithinRepository(input.config_path);

        const content = await readFile(filePath, 'utf8');

        const extension = path.extname(filePath).toLowerCase();

        const configType =
          input.config_type === 'auto'
            ? extension === '.json'
              ? 'json'
              : 'javascript'
            : input.config_type;

        if (configType === 'json') {
          const parsed = JSON.parse(content);

          return {
            status: 'PASS',

            summary: 'JSON configuration parsed successfully.',

            file_path: path.relative(REPO_ROOT, filePath),

            top_level_type: Array.isArray(parsed) ? 'array' : typeof parsed,

            content_digest: sha256(content),
          };
        }

        const result = await runCommand(process.execPath, ['--check', filePath], {
          cwd: REPO_ROOT,
          timeoutMs: 10_000,
          maxOutputBytes: 32_000,
        });

        return {
          status: result.ok ? 'PASS' : 'FAIL',

          summary: result.ok
            ? 'JavaScript syntax check passed.'
            : 'JavaScript syntax check failed.',

          file_path: path.relative(REPO_ROOT, filePath),

          stdout: result.stdout || undefined,

          stderr: result.stderr || undefined,
        };
      }
    )
);

/**
 * Check runtime services before retrieval or LLM inference.
 */
server.registerTool(
  'runtime_preflight',
  {
    title: 'Parent Atlas Runtime Preflight',

    description:
      'Check service readiness before retrieval or LLM inference and log a compact receipt.',

    inputSchema: {
      services: z
        .array(z.enum(['qdrant', 'embedding', 'synthesis', 'nlp', 'sveltekit']))
        .default(['qdrant', 'embedding', 'synthesis', 'nlp', 'sveltekit']),

      timeout_ms: z.number().int().min(1_000).max(15_000).default(5_000),
    },
  },

  async (input) =>
    executeTool(
      'runtime_preflight',
      input,

      async () => {
        const healthPaths = {
          qdrant: '/readyz',
          embedding: '/health',
          synthesis: '/health',
          nlp: '/health',
          sveltekit: '/api/health',
        };

        const checks = await Promise.all(
          input.services.map(async (service) => {
            const endpoint = serviceEndpoints[service];

            const url = `${endpoint.replace(/\/+$/, '')}` + `${healthPaths[service]}`;

            const result = await fetchWithTimeout(url, input.timeout_ms);

            return {
              service,
              endpoint,
              url,
              ...result,

              body:
                typeof result.body === 'string'
                  ? truncateText(result.body, 2_000).text
                  : result.body,
            };
          })
        );

        const failures = checks.filter((check) => !check.ok);

        return {
          status: failures.length === 0 ? 'PASS' : 'WARN',

          summary:
            failures.length === 0
              ? 'All requested Parent Atlas services are reachable.'
              : `${failures.length}/${checks.length} requested services are unavailable.`,

          representation_contract: {
            canonical_dense: 'semantic_768',

            routing_latent: 'latent_64',

            embedding_endpoint: serviceEndpoints.embedding,

            synthesis_endpoint: serviceEndpoints.synthesis,
          },

          checks,

          available_lanes: checks.filter((check) => check.ok).map((check) => check.service),

          suppressed_lanes: failures.map((check) => check.service),
        };
      }
    )
);

/**
 * Run one allowlisted project validation.
 */
server.registerTool(
  'run_validation',
  {
    title: 'Run an Allowlisted Validation',

    description: 'Run one allowlisted Parent Atlas validation command with a bounded timeout.',

    inputSchema: {
      check_type: z.enum(['type', 'lint', 'build', 'scripts', 'packet_contract', 'embedding']),

      project_path: z.string().default('sveltekit-frontend'),

      timeout_ms: z.number().int().min(5_000).max(MAX_TIMEOUT_MS).default(60_000),
    },
  },

  async (input) =>
    executeTool(
      'run_validation',
      input,

      async () => {
        const cwd = resolveWithinRepository(input.project_path);

        const selected = validationCommands[input.check_type];

        if (!selected) {
          throw new Error(`UNKNOWN_VALIDATION: ${input.check_type}`);
        }

        const result = await runCommand(selected.command, selected.args, {
          cwd,
          timeoutMs: input.timeout_ms,
        });

        const boundedStdout = truncateText(result.stdout, 64_000);

        const boundedStderr = truncateText(result.stderr, 64_000);

        return {
          status: result.ok ? 'PASS' : result.timedOut ? 'TIMEOUT' : 'FAIL',

          summary: result.ok
            ? `${input.check_type} validation passed.`
            : `${input.check_type} validation failed.`,

          command: [selected.command, ...selected.args],

          cwd: path.relative(REPO_ROOT, cwd),

          exit_code: result.exitCode,

          signal: result.signal,

          timed_out: result.timedOut,

          output_limited: result.outputLimitExceeded,

          stdout: boundedStdout.text || undefined,

          stdout_truncated: boundedStdout.truncated,

          stderr: boundedStderr.text || undefined,

          stderr_truncated: boundedStderr.truncated,
        };
      }
    )
);

/**
 * Return MCP server and project status.
 */
server.registerTool(
  'get_project_status',
  {
    title: 'Get Parent Atlas Project Status',

    description:
      'Return repository paths, configured services, receipt-log path, and graph artifact freshness.',

    inputSchema: {
      include_graph_freshness: z.boolean().default(true),
    },
  },

  async (input) =>
    executeTool(
      'get_project_status',
      input,

      async () => {
        const graphCandidates = [
          path.join(REPO_ROOT, 'codebase-graph.json'),

          path.join(REPO_ROOT, 'docs', 'graph', 'codebase-graph.json'),

          path.join(APP_ROOT, 'codebase-graph.json'),
        ];

        let graph = null;

        if (input.include_graph_freshness) {
          for (const candidate of graphCandidates) {
            try {
              const fileInfo = await stat(candidate);

              graph = {
                path: path.relative(REPO_ROOT, candidate),

                modified_at: fileInfo.mtime.toISOString(),

                age_minutes: (Date.now() - fileInfo.mtimeMs) / 60_000,
              };

              break;
            } catch {
              // Try the next known graph location.
            }
          }
        }

        return {
          status: 'PASS',

          summary: 'Parent Atlas MCP project status collected.',

          server: {
            name: SERVER_NAME,

            version: SERVER_VERSION,

            transport: 'stdio',

            pid: process.pid,

            node: process.version,
          },

          paths: {
            repo_root: REPO_ROOT,

            app_root: APP_ROOT,

            receipt_log: RECEIPT_PATH,
          },

          services: serviceEndpoints,

          graph,
        };
      }
    )
);

async function main() {
  await mkdir(LOG_DIR, {
    recursive: true,
  });

  /*
   * Never write diagnostics to stdout.
   * stdout belongs exclusively to the MCP stdio protocol.
   */
  process.stderr.write(
    `[${SERVER_NAME}] ` + `v${SERVER_VERSION} ` + `starting via stdio; ` + `repo=${REPO_ROOT}\n`
  );

  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch(async (error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);

  process.stderr.write(`[${SERVER_NAME}] fatal: ${message}\n`);

  try {
    await mkdir(LOG_DIR, {
      recursive: true,
    });

    await appendFile(
      RECEIPT_PATH,

      `${JSON.stringify({
        schema_version: 'atlas.mcp-server-failure.v1',

        generated_at: new Date().toISOString(),

        status: 'FAIL',

        message,
      })}\n`,

      'utf8'
    );
  } catch {
    // Preserve the original startup failure.
  }

  process.exit(1);
});
