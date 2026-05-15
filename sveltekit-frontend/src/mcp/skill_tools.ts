import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SubagentOrchestrator } from "../lib/server/admin/subagent-orchestrator.js";
import { SkillsService } from "../lib/server/admin/skills-service.js";

/**
 * Skill-based tools for Gemma 4.
 * Allows the AI to list and invoke specialized autonomous skills.
 */
export function registerSkillTools(server: McpServer) {

  // == skills.list ============================================================
  server.registerTool(
    'skills.list',
    {
      description: 'Filter skills by name or description.',
      inputSchema: z.object({
        query: z.string().optional().describe('Filter skills by name or description')
      })
    },
    async ({ query }) => {
      const skills = await SkillsService.listSkills(query);
      return {
        content: [{ type: 'text', text: JSON.stringify(skills, null, 2) }]
      };
    }
  );

  // == skills.run_mission =====================================================
  server.registerTool(
    'skills.run_mission',
    {
      description: 'Execute a specialized autonomous skill mission.',
      inputSchema: z.object({
        skillName: z.string().describe('The name of the skill to execute'),
        mission: z.string().describe('The specific mission description'),
        input: z.record(z.string(), z.any()).optional().describe('Input parameters for the skill')
      })
    },
    async ({ skillName, mission, input }) => {
      // Note: In a real MCP server, we might want to run this async or stream it.
      // For now, we'll run it synchronously and return the result.
      const result = await SubagentOrchestrator.runMission('system', {
        skillName,
        mission,
        input
      });

      return {
        content: [{ type: 'text', text: `Mission ${result.runId} completed.\nResult: ${result.result}` }]
      };
    }
  );
}
