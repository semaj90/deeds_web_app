import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DispatcherMiddleware } from './dispatcher-middleware.js';
import { generateSessionId, createToolWithDispatcher } from './dispatcher-tool-integration.js';
import {
  buildCodebaseRgSearchArgsV1,
  codebaseRgSearchInputSchema,
  CODEBASE_RG_MAX_OUTPUT_BYTES,
  truncateUtf8TextV1,
} from './read-tool-bounds.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/**
 * Advanced codebase analysis tools leveraging ripgrep (rg) and awk.
 * These tools allow the AI to perform deep logic searches across the repo.
 */
export function registerCodebaseTools(server: McpServer, dispatcherMiddleware?: DispatcherMiddleware) {
  const sessionId_rg_search = generateSessionId();
  const sessionId_awk_analyze = generateSessionId();

  // == codebase.rg_search =====================================================
  server.registerTool(
    'codebase.rg_search',
    {
      description: 'The search pattern (ripgrep style).',
      inputSchema: codebaseRgSearchInputSchema.shape,
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'codebase.rg_search',
      sessionId_rg_search,
      async (rawInput: Record<string, unknown>) => {
      const input = codebaseRgSearchInputSchema.parse(rawInput);
      try {
        const { stdout, stderr } = await execFileAsync('rg', buildCodebaseRgSearchArgsV1(input), {
          cwd: process.cwd(),
          timeout: 10000,
          maxBuffer: CODEBASE_RG_MAX_OUTPUT_BYTES,
        });

        return {
          content: [{
            type: 'text',
            text: truncateUtf8TextV1(stdout || stderr || 'No matches found.', CODEBASE_RG_MAX_OUTPUT_BYTES),
          }]
        };
      } catch (err: any) {
        if (err?.code === 1) {
          return { content: [{ type: 'text', text: 'No matches found.' }] };
        }
        if (err?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          return {
            content: [{ type: 'text', text: 'Search output exceeded the 128 KiB limit.' }],
          };
        }
        return {
          content: [{
            type: 'text',
            text: truncateUtf8TextV1(err.stdout || `Search failed: ${err.message}`, CODEBASE_RG_MAX_OUTPUT_BYTES),
          }],
          isError: !err.stdout
        };
      }
      }
    )
  );

  // == codebase.awk_analyze ===================================================
  server.registerTool(
    'codebase.awk_analyze',
    {
      description: 'Advanced codebase analysis tools leveraging awk.',
      inputSchema: z.object({
        filePath: z.string().describe('File path to analyze'),
        pattern: z.string().describe('Pattern to match (regex)'),
        logic: z.string().describe('AWK logic to apply (e.g. "{print $1}")')
      })
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'codebase.awk_analyze',
      sessionId_awk_analyze,
      async ({ filePath, pattern, logic }) => {
      try {
        // Safety: Limit to current workspace
        if (filePath.includes('..')) throw new Error('Path traversal detected');

        const command = `awk "/${pattern.replace(/\//g, '\\/')}/ ${logic.replace(/"/g, '\\"')}" "${filePath}"`;
        const { stdout } = await execAsync(command, { timeout: 5000 });

        return {
          content: [{ type: 'text', text: stdout || 'No output from AWK.' }]
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `AWK analysis failed: ${err.message}` }], isError: true };
      }
      }
    )
  );
}
