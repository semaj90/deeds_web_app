import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

  // Hermes / Gemma tool-call fallbacks:
  // 1. terminal(shell="pwd")
  // 2. terminal(command="pwd")
  // 3. bare terminal text inside <execute_bash> blocks
  const keyValueMatch = normalized.match(/^(?:shell|command)\s*=\s*["']([\s\S]*)["']$/i);
  if (keyValueMatch) {
    return { command: keyValueMatch[1] };
  }

  if (tool === 'terminal') {
    return { command: normalized };
  }

  return {};
}

export function parseToolCall(text: string) {
  return parseToolCalls(text)[0] ?? null;
}

export function parseToolCalls(text: string) {
  const candidates: Array<{ tool: string; args: string }> = [];

  const executeBash = [...text.matchAll(/<execute_bash>([\s\S]*?)<\/execute_bash>/gi)];
  for (const match of executeBash) {
    candidates.push({ tool: 'terminal', args: match[1] });
  }

  const toolCode = [...text.matchAll(/<tool_code>([\s\S]*?)<\/tool_code>/gi)];
  for (const match of toolCode) {
    candidates.push({ tool: 'terminal', args: match[1] });
  }

  const toolCallTagged = [...text.matchAll(/<\|tool_call\|>call:(\w+)([\s\S]*?)<tool_call\|>/gi)];
  for (const match of toolCallTagged) {
    candidates.push({ tool: match[1], args: match[2] || '{}' });
  }

  const callParen = [...text.matchAll(/call:(\w+)\(([\s\S]*?)\)/gi)];
  for (const match of callParen) {
    candidates.push({ tool: match[1], args: match[2] || '{}' });
  }

  const parsedCandidates = candidates
    .map((candidate) => {
      const tool = candidate.tool.trim();
      const args = parseArgsString(tool, candidate.args);
      return tool ? { tool, args } : null;
    })
    .filter((item): item is { tool: string; args: Record<string, any> } => Boolean(item));

  if (parsedCandidates.length > 0) {
    return parsedCandidates;
  }

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
                try {
                  return JSON.parse(tc.function.arguments);
                } catch {
                  return {};
                }
              })()
            : (tc?.function?.arguments ?? {}),
        }))
        .filter((item) => item.tool);
    } catch {
      // ignore
    }
  }

  return [];
}

export async function executeTool(call: { tool: string; args: any }, context?: any) {
  switch (call.tool) {
    case "rg_search":
      {
        const { tool_codebase_rg_search } = await import('./mcp-tool-dispatch.js');
        return tool_codebase_rg_search(call.args);
      }

    case "graph_expand":
      {
        const { tool_graph_expand_neighborhood } = await import('./mcp-tool-dispatch.js');
        return tool_graph_expand_neighborhood(call.args);
      }

    case "atlas_lookup":
    case "search.hybrid":
      {
        const { tool_search_hybrid } = await import('./mcp-tool-dispatch.js');
        return tool_search_hybrid ? tool_search_hybrid(call.args) : null;
      }

    case "terminal": {
      const command = String(call.args?.command ?? '').trim();
      if (!command) return { ok: false, tool: 'terminal', error: 'Missing terminal command' };
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'powershell.exe' : '/bin/bash';
      const args = isWindows
        ? ['-NoProfile', '-Command', command]
        : ['-lc', command];
      try {
        const { stdout, stderr } = await execFileAsync(shell, args, {
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          env: process.env,
        });
        return {
          ok: true,
          tool: 'terminal',
          command,
          stdout: String(stdout ?? '').trim(),
          stderr: String(stderr ?? '').trim(),
        };
      } catch (error: any) {
        return {
          ok: false,
          tool: 'terminal',
          command,
          error: String(error?.message ?? error),
        };
      }
    }

    default:
      return null;
  }
}
