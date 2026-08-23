import { db } from '$lib/server/db/client';
import { adminAiSkills, adminAiSubagentRuns } from '$lib/server/db/schema.js';
import { traceMcpClient } from '$lib/server/mcp-client.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { getLlamaSessionDescriptor } from '$lib/server/ai/local-llama-provider.js';
import { eq } from 'drizzle-orm';
import { appendOutcomeLedger } from '$lib/server/observability/outcome-ledger.js';

export interface SubagentMission {
  skillName: string;
  mission: string;
  sessionId?: string;
  input?: any;
}

export class SubagentOrchestrator {
  /**
   * Executes a mission using a specific skill.
   * Runs a tool-calling loop (CoT) until completion or max steps.
   */
  static async runMission(userId: string, params: SubagentMission) {
		const { skillName, mission, sessionId, input } = params;

		// 1. Fetch Skill
		const [skill] = await db
			.select()
			.from(adminAiSkills)
			.where(eq(adminAiSkills.name, skillName))
			.limit(1);

    if (!skill) throw new Error(`Skill not found: ${skillName}`);

    // 2. Initialize Run
    const [run] = await db.insert(adminAiSubagentRuns).values({
      skillId: skill.id,
      sessionId,
      status: 'running',
      mission,
      trace: []
    }).returning();

    const trace: any[] = [];
    let status = 'running';
    let result = '';
    let tokensUsed = 0;

    // 3. Execution Loop (Max 5 steps for safety)
    for (let step = 0; step < 5; step++) {
      const prompt = `
        MISSION: ${mission}
        INPUT: ${JSON.stringify(input)}
        CURRENT TRACE: ${JSON.stringify(trace)}
        
        ${skill.systemPrompt}
        
        AVAILABLE TOOLS: ${(skill.toolAllowlist || []).join(', ')}
        
        You MUST respond in the following JSON format:
        {
          "thought": "your reasoning",
          "tool": "tool_name or null",
          "args": {},
          "final_answer": "your answer if finished, otherwise null"
        }
      `;

      const llamaSession = await getLlamaSessionDescriptor();
      const chatResult = await bifrostChat(
        [{ role: 'system', content: prompt }],
        llamaSession.modelId,
        { responseFormat: { type: 'json_object' }, includeMetadata: true }
      );

      const output = JSON.parse(chatResult.content);
      tokensUsed += chatResult.usage?.totalTokens ?? 0;

      if (output.final_answer) {
        result = output.final_answer;
        status = 'completed';
        trace.push({ step, thought: output.thought, result: result });
        break;
      }

      if (output.tool) {
        // Tool calling via MCP Client
        const toolResult = await traceMcpClient.callTool(output.tool, output.args);
        trace.push({ 
          step, 
          thought: output.thought, 
          tool: output.tool, 
          args: output.args, 
          output: toolResult.content || toolResult.isError
        });
      } else {
        trace.push({ step, thought: output.thought, error: 'No tool or final answer provided' });
        break;
      }
    }

    // 4. Update Run
    await db.update(adminAiSubagentRuns)
      .set({ 
        status: status === 'completed' ? 'completed' : 'failed',
        result,
        trace,
        tokensUsed,
        completedAt: new Date()
      })
      .where(eq(adminAiSubagentRuns.id, run.id));

    void appendOutcomeLedger({
      source: 'subagent-orchestrator',
      runId: run.id,
      skillName,
      mission,
      status: status === 'completed' ? 'ok' : 'failed',
      tokensUsed
    });

    return { runId: run.id, result, trace };
  }
}
