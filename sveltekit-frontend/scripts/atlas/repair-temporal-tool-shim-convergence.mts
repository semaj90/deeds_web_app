#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'src/lib/server/ai/tool-shim.ts');
let source = await readFile(target, 'utf8');

const startNeedle = 'async function executeToolAtDepth(\n';
const exportNeedle = 'export async function executeTool(';
const depthCount = source.split(startNeedle).length - 1;
const dispatchCount = source.split('async function dispatchTool(').length - 1;
const hookCount = source.split('async function runTemporalPostDispatchHook(').length - 1;
const exportCount = source.split(exportNeedle).length - 1;

if (depthCount === 1 && dispatchCount === 1 && hookCount === 1 && exportCount === 1 && !source.includes('decision.execution_key,\n    ];\n    const selection')) {
  console.log('[DAG-00] tool-shim convergence already appears repaired');
  process.exit(0);
}

if (depthCount !== 2 || dispatchCount !== 1 || hookCount !== 1 || exportCount !== 1) {
  throw new Error(
    `[DAG-00] unexpected convergence shape: executeToolAtDepth=${depthCount} dispatchTool=${dispatchCount} hook=${hookCount} executeToolExport=${exportCount}`,
  );
}

const start = source.indexOf(startNeedle);
const end = source.indexOf(exportNeedle, start);
if (start < 0 || end <= start) throw new Error('[DAG-00] repair boundaries not found');

const replacement = `async function dispatchTool(call: { tool: string; args: any }): Promise<ToolDispatchResult> {
  switch (call.tool) {
    case 'rg_search': {
      const { tool_codebase_rg_search } = await import('./mcp-tool-dispatch.js');
      return { dispatched: true, result: await tool_codebase_rg_search(call.args) };
    }
    case 'graph_expand': {
      const { tool_graph_expand_neighborhood } = await import('./mcp-tool-dispatch.js');
      return { dispatched: true, result: await tool_graph_expand_neighborhood(call.args) };
    }
    case 'atlas_lookup':
    case 'search.hybrid': {
      const { tool_search_hybrid } = await import('./mcp-tool-dispatch.js');
      if (!tool_search_hybrid) return { dispatched: false, result: null };
      return { dispatched: true, result: await tool_search_hybrid(call.args) };
    }
    case 'terminal': {
      const command = String(call.args?.command ?? '').trim();
      if (!command) {
        return {
          dispatched: false,
          result: { ok: false, tool: 'terminal', error: 'Missing terminal command' },
        };
      }
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'powershell.exe' : '/bin/bash';
      const args = isWindows ? ['-NoProfile', '-Command', command] : ['-lc', command];
      try {
        const { stdout, stderr } = await execFileAsync(shell, args, {
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          env: process.env,
        });
        return {
          dispatched: true,
          result: {
            ok: true,
            tool: 'terminal',
            command,
            stdout: String(stdout ?? '').trim(),
            stderr: String(stderr ?? '').trim(),
          },
        };
      } catch (error: any) {
        return {
          dispatched: true,
          result: {
            ok: false,
            tool: 'terminal',
            command,
            error: String(error?.message ?? error),
          },
        };
      }
    }
    default:
      return { dispatched: false, result: null };
  }
}

async function runTemporalPostDispatchHook(
  call: { tool: string; args: any },
  result: unknown,
  context?: ToolExecutionContext,
): Promise<void> {
  if (!context?.temporalAction || !context.temporalPostDispatch) return;
  await context.temporalPostDispatch({
    call,
    result,
    temporalAction: context.temporalAction,
    temporalBoundary: context.temporalActionBoundary ?? null,
  });
}

async function executeToolAtDepth(
  call: { tool: string; args: any },
  context: ToolExecutionContext | undefined,
  depth: number,
): Promise<unknown> {
  if (depth > MAX_TEMPORAL_ALTERNATIVE_HOPS) {
    throw new Error(\`TEMPORAL_ALTERNATIVE_HOP_LIMIT_EXCEEDED:\${MAX_TEMPORAL_ALTERNATIVE_HOPS}\`);
  }

  const temporal = await applyTemporalBoundary(call, context);
  if (temporal?.kind === 'SHORT_CIRCUIT') return temporal.result;
  if (temporal?.kind === 'REPLACE') {
    if (!context) throw new Error('TEMPORAL_ALTERNATIVE_CONTEXT_MISSING');
    context.temporalAction = temporal.temporalAction;
    context.temporalAlternativeDepth = depth + 1;
    return executeToolAtDepth(temporal.call, context, depth + 1);
  }

  const dispatched = await dispatchTool(call);
  if (dispatched.dispatched) {
    await runTemporalPostDispatchHook(call, dispatched.result, context);
  }
  return dispatched.result;
}

`;

source = source.slice(0, start) + replacement + source.slice(end);
await writeFile(target, source, 'utf8');
console.log(`[DAG-00] repaired ${path.relative(root, target).replaceAll('\\\\', '/')}`);
