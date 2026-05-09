import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Administrative and Contextual tools for the TRACE Admin Assistant.
 */
export function registerAdminTools(server: McpServer) {

  // == ui.analyze_view ========================================================
  /**
   * Analyzes the current UI state based on a provided snapshot.
   * This allows the agent to 'see' what the user is looking at.
   */
  server.tool(
    'ui.analyze_view',
    {
      snapshot: z.record(z.string(), z.any()).describe('A structured snapshot of the current UI elements'),
      focus: z.string().optional().describe('Specific element ID to focus on')
    },
    async ({ snapshot, focus }) => {
      // In a real implementation, this might use a vision model or a complex heuristic.
      // For now, we'll return a structured summary of the snapshot.
      const elements = Object.keys(snapshot).length;
      const focused = focus ? snapshot[focus] : null;

      return {
        content: [{ 
          type: 'text', 
          text: `View analysis complete. Found ${elements} trackable elements. ${focused ? `Focus element [${focus}] identified as ${focused.type}.` : ''}` 
        }]
      };
    }
  );

  // == admin.log_event ========================================================
  /**
   * Logs a manual administrative event with context.
   */
  server.tool(
    'admin.log_event',
    {
      event: z.string().describe('The event description'),
      severity: z.enum(['info', 'warning', 'error']).default('info'),
      context: z.record(z.string(), z.any()).optional()
    },
    async ({ event, severity, context }) => {
      console.log(`[ADMIN LOG] [${severity.toUpperCase()}] ${event}`, context);
      return {
        content: [{ type: 'text', text: `Event logged successfully with ${severity} severity.` }]
      };
    }
  );

  // == ops.execute_graphify ==================================================
  /**
   * Executes an authorized graphify pipeline command.
   * Gated executor for topological maintenance.
   */
  server.tool(
    'ops.execute_graphify',
    {
      command: z.enum([
        'npm run graphify:topology:gpu',
        'npm run qdrant:patch-topology',
        'npm run graphify:seed-llm-index'
      ]).describe('The canonical graphify command to execute'),
      confirm: z.boolean().describe('Must be true to execute')
    },
    async ({ command, confirm }) => {
      if (!confirm) {
        return { content: [{ type: 'text', text: 'Execution aborted. Confirmation required.' }] };
      }

      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      try {
        console.log(`[OPS] Executing gated command: ${command}`);
        // We run in the frontend directory where these scripts are usually defined.
        const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
        
        return {
          content: [{ 
            type: 'text', 
            text: `Command executed successfully.\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}` 
          }]
        };
      } catch (err: any) {
        return { 
          content: [{ type: 'text', text: `Command failed: ${err.message}` }], 
          isError: true 
        };
      }
    }
  );
}
