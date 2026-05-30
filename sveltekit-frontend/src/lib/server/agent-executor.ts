import { traceMcpClient } from './mcp-client.js';

export interface AgentSkillArgs {
  skillName: string;
  arguments?: Record<string, any>;
  userId?: string;
  caseId?: string;
}

/**
 * Executes a specific agent skill via the TRACE MCP tool.
 */
export async function runAgentSkill(args: AgentSkillArgs) {
  try {
    const result = await traceMcpClient.callTool(`trace.${args.skillName}`, args.arguments || {});
    return {
      success: true,
      result
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent-executor] runAgentSkill failed for ${args.skillName}:`, message);
    return {
      success: false,
      error: message
    };
  }
}
