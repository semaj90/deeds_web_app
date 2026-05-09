import { db } from '$lib/server/db/client.js';
import { adminAiSkills, adminAiSubagentRuns } from '$lib/server/db/schema.js';
import { traceMcpClient } from '$lib/server/mcp-client.js';
import { ENV } from '$lib/server/env.server.js';
import { eq } from 'drizzle-orm';

const MODEL_URL = ENV.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8080';

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
    const skill = await db.query.adminAiSkills.findFirst({
      where: eq(adminAiSkills.name, skillName)
    });

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

      const res = await fetch(`${MODEL_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ENV.GEMMA4_MODEL ?? 'gemma4',
          messages: [{ role: 'system', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      const data = await res.json();
      const output = JSON.parse(data.choices[0].message.content);
      tokensUsed += data.usage?.total_tokens || 0;

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

    return { runId: run.id, result, trace };
  }
}
