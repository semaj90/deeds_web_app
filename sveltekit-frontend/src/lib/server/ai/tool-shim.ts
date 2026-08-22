import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_TEMPORAL_ALTERNATIVE_HOPS = 8;

function stripToolMarkup(text: string): string {
  return text
    .replace(/<\|"\|>/g, '"')
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();
}

function parseArgsString(tool: string, rawArgs: string): Record<string, any> {
  const normalized = stripToolMarkup(rawArgs);
  if (!normalized) return {};

  try {
    if (normalized.startsWith('{') || normalized.startsWith('[')) {
      return JSON.parse(normalized);
    }
  } catch {
    // fall through to loose parsing
  }

  const keyValueMatch = normalized.match(/^(?:shell|command)\s*=\s*["']([\s\S]*)["']$/i);
  if (keyValueMatch) return { command: keyValueMatch[1] };
  if (tool === 'terminal') return { command: normalized };
  return {};
}

export function parseToolCall(text: string) {
  return parseToolCalls(text)[0] ?? null;
}

export function parseToolCalls(text: string) {
  const candidates: Array<{ tool: string; args: string }> = [];
  for (const match of text.matchAll(/<execute_bash>([\s\S]*?)<\/execute_bash>/gi)) {
    candidates.push({ tool: 'terminal', args: match[1] });
  }
  for (const match of text.matchAll(/<tool_code>([\s\S]*?)<\/tool_code>/gi)) {
    candidates.push({ tool: 'terminal', args: match[1] });
  }
  for (const match of text.matchAll(/<\|tool_call\|>call:(\w+)([\s\S]*?)<tool_call\|>/gi)) {
    candidates.push({ tool: match[1], args: match[2] || '{}' });
  }
  for (const match of text.matchAll(/call:(\w+)\(([\s\S]*?)\)/gi)) {
    candidates.push({ tool: match[1], args: match[2] || '{}' });
  }

  const parsedCandidates = candidates
    .map((candidate) => {
      const tool = candidate.tool.trim();
      const args = parseArgsString(tool, candidate.args);
      return tool ? { tool, args } : null;
    })
    .filter((item): item is { tool: string; args: Record<string, any> } => Boolean(item));
  if (parsedCandidates.length > 0) return parsedCandidates;

  const jsonBlockMatch = text.match(/\{[\s\S]*"tool_calls"\s*:\s*\[[\s\S]*\][\s\S]*\}/i);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[0]);
      const toolCalls = Array.isArray(parsed?.tool_calls) ? parsed.tool_calls : [];
      return toolCalls
        .map((tc: any) => ({
          tool: String(tc?.function?.name ?? '').trim(),
          args: typeof tc?.function?.arguments === 'string'
            ? (() => {
                try { return JSON.parse(tc.function.arguments); } catch { return {}; }
              })()
            : (tc?.function?.arguments ?? {}),
        }))
        .filter((item) => item.tool);
    } catch {
      // ignore malformed model tool JSON
    }
  }
  return [];
}

export type TemporalPostDispatchHookInput = {
  call: { tool: string; args: any };
  result: unknown;
  temporalAction: unknown;
  temporalBoundary: unknown;
};

export type TemporalPostDispatchHook = (input: TemporalPostDispatchHookInput) => Promise<void> | void;

type ToolExecutionContext = {
  temporalAction?: unknown;
  temporalActionBoundary?: unknown;
  temporalAlternativePlan?: unknown;
  temporalAlternativeSelection?: unknown;
  temporalAlternativeDepth?: number;
  temporalPostDispatch?: TemporalPostDispatchHook;
  [key: string]: unknown;
};

type TemporalBoundaryOutcome =
  | { kind: 'SHORT_CIRCUIT'; result: unknown }
  | { kind: 'REPLACE'; call: { tool: string; args: any }; temporalAction: unknown; failedExecutionKey: string }
  | null;

type ToolDispatchResult = { dispatched: boolean; result: unknown };

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

/**
 * Optional temporal execution policy. Existing callers remain unchanged unless
 * they explicitly supply `context.temporalAction`.
 *
 * Once supplied, the temporal gate is mandatory and fail-closed. A lookup or
 * validation error is allowed to surface rather than silently re-running work.
 */
async function applyTemporalBoundary(
  call: { tool: string; args: any },
  context?: ToolExecutionContext,
): Promise<TemporalBoundaryOutcome> {
  if (!context?.temporalAction) return null;

  const {
    decideTemporalToolExecutionFromPostgres,
    temporalBoundaryAllowsDispatch,
  } = await import('../atlas/temporal/temporal-tool-execution-boundary.js');

  const decision = await decideTemporalToolExecutionFromPostgres({
    call,
    temporal: context.temporalAction as never,
  });
  context.temporalActionBoundary = decision;

  if (temporalBoundaryAllowsDispatch(decision)) return null;

  if (decision.disposition === 'REUSE_RESULT') {
    return {
      kind: 'SHORT_CIRCUIT',
      result: {
        ok: true,
        tool: call.tool,
        temporalDisposition: 'REUSE_RESULT',
        reused: true,
        resultRef: decision.reused_result_ref,
        executionKey: decision.execution_key,
        priorEventId: decision.prior_event_id,
        reason: decision.reason,
        boundaryChecksum: decision.boundary_checksum,
      },
    };
  }

  if (decision.disposition !== 'SELECT_ALTERNATIVE') {
    throw new Error(`TEMPORAL_NONDISPATCH_DISPOSITION_UNHANDLED:${decision.disposition}`);
  }

  if (context.temporalAlternativePlan) {
    const { selectTemporalAlternativeToolFromPostgres } = await import(
      '../atlas/temporal/temporal-action-alternative-boundary.js'
    );
    const plan = context.temporalAlternativePlan as Record<string, any>;
    const exclusions = new Set<string>([
      ...(Array.isArray(plan.excluded_execution_keys) ? plan.excluded_execution_keys : []),
      decision.execution_key,
    ]);
    const selection = await selectTemporalAlternativeToolFromPostgres({
      failed_boundary: decision,
      plan: {
        ...plan,
        excluded_execution_keys: [...exclusions],
      } as never,
    });
    context.temporalAlternativeSelection = selection;
    context.temporalAlternativePlan = {
      ...plan,
      excluded_execution_keys: [...exclusions],
    };
    return {
      kind: 'REPLACE',
      call: selection.selected_call,
      temporalAction: selection.selected_temporal,
      failedExecutionKey: decision.execution_key,
    };
  }

  return {
    kind: 'SHORT_CIRCUIT',
    result: {
      ok: false,
      tool: call.tool,
      temporalDisposition: 'SELECT_ALTERNATIVE',
      reused: false,
      resultRef: null,
      executionKey: decision.execution_key,
      priorEventId: decision.prior_event_id,
      reason: decision.reason,
      boundaryChecksum: decision.boundary_checksum,
    },
  };
}

async function dispatchTool(call: { tool: string; args: any }): Promise<ToolDispatchResult> {
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
        return { dispatched: false, result: { ok: false, tool: 'terminal', error: 'Missing terminal command' } };
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
          result: { ok: false, tool: 'terminal', command, error: String(error?.message ?? error) },
        };
      }
    }
    default:
      return { dispatched: false, result: null };
  }
}

async function executeToolAtDepth(
  call: { tool: string; args: any },
  context: ToolExecutionContext | undefined,
  depth: number,
): Promise<unknown> {
  if (depth > MAX_TEMPORAL_ALTERNATIVE_HOPS) {
    throw new Error(`TEMPORAL_ALTERNATIVE_HOP_LIMIT_EXCEEDED:${MAX_TEMPORAL_ALTERNATIVE_HOPS}`);
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

export async function executeTool(call: { tool: string; args: any }, context?: ToolExecutionContext) {
  const initialDepth = Number.isInteger(context?.temporalAlternativeDepth)
    ? Number(context?.temporalAlternativeDepth)
    : 0;
  return executeToolAtDepth(call, context, initialDepth);
}
