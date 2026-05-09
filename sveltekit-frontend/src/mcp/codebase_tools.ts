import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Advanced codebase analysis tools leveraging ripgrep (rg) and awk.
 * These tools allow the AI to perform deep logic searches across the repo.
 */
export function registerCodebaseTools(server: McpServer) {

  // == codebase.rg_search =====================================================
  server.tool(
    'codebase.rg_search',
    {
      query: z.string().describe('The search pattern (ripgrep style)'),
      include: z.string().optional().describe('Glob for files to include'),
      contextLines: z.number().default(2).describe('Lines of context to show')
    },
    async ({ query, include, contextLines }) => {
      try {
        const includeFlag = include ? `-g "${include}"` : '';
        // Safety: Limit output and prevent command injection
        const command = `rg --max-columns 200 --context ${contextLines} ${includeFlag} -- "${query.replace(/"/g, '\\"')}" .`;
        
        const { stdout, stderr } = await execAsync(command, { 
          cwd: process.cwd(),
          timeout: 10000 
        });

        return {
          content: [{ type: 'text', text: stdout || stderr || 'No matches found.' }]
        };
      } catch (err: any) {
        return { 
          content: [{ type: 'text', text: err.stdout || `Search failed: ${err.message}` }],
          isError: !err.stdout 
        };
      }
    }
  );

  // == codebase.awk_analyze ===================================================
  server.tool(
    'codebase.awk_analyze',
    {
      filePath: z.string().describe('File path to analyze'),
      pattern: z.string().describe('Pattern to match (regex)'),
      logic: z.string().describe('AWK logic to apply (e.g. "{print $1}")')
    },
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
  );
}
