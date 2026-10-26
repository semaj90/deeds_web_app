import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execFile } from "node:child_process";
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

/**
 * Registers bounded, shell-free codebase search tools.
 */
export function registerCodebaseTools(server: McpServer, dispatcherMiddleware?: DispatcherMiddleware) {
  const sessionId_rg_search = generateSessionId();

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
    ,
    'READ_ONLY'
    )
  );
}
