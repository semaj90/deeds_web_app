/**
 * src/lib/server/ace/hermes-mastra-orchestrator.ts
 *
 * Hermes-like agent planner using Mastra framework with Gemma4 fallback.
 * Paperclip agent orchestration for tool planning + execution.
 *
 * Flow:
 * 1. User query → Mastra agent planner (decompose intent, select tools)
 * 2. Mastra execution via paperclip tool definitions (MCP tools via bridge)
 * 3. Fallback to Gemma4 llama-server if Mastra orchestration fails
 * 4. Result synthesis + context injection for downstream ACE
 */

import { getRedis } from '$lib/server/redis.js';
import { DebouncedDagLogger, type DagLogSink } from '$lib/server/observability/dag-debounced-logger.js';
import { assembleACEContext } from '$lib/server/features/ai/ace/context-assembler.js';
import { runPacketConsumerPipeline } from '$lib/server/atlas/packet-consumer-pipeline.js';
import { derivePacketInputsFromAceContext } from '$lib/server/atlas/packet-consumer-inputs.js';

export interface HermesQuery {
  query: string;
  intent?: 'analyze' | 'search' | 'plan' | 'summarize' | 'rank' | 'auto';
  sessionId?: string;
  userId?: string;
  fileContext?: string;
  caseId?: string;
}

export interface HermesDecision {
  selectedTools: string[];
  toolArguments: Record<string, any>[];
  reasoning: string;
  fallbackReason?: string;
}

export interface HermesResult {
  decision: HermesDecision;
  executionPath: 'mastra' | 'gemma4-fallback' | 'gemma4-primary';
  toolResults: any[];
  synthesis: string;
  timing: {
    planningMs: number;
    executionMs: number;
    totalMs: number;
  };
}

/**
 * Hermes orchestrator: Mastra planner → MCP tool bridge → Gemma4 fallback
 */
export class HermesMastraOrchestrator {
  private static redis = getRedis();
  private static MASTRA_ENABLED = process.env.MASTRA_ENABLED === 'true';
  private static GEMMA4_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1';

  // Debounced DAG orchestration logger
  private static dagSink: DagLogSink = {
    async emit(event) {
      console.log(`[DAG/${event.kind}] ${event.message}`, {
        workflow: event.workflowId,
        run: event.runId,
        debounced: event.debounce?.coalescedCount || 1
      });
    }
  };

  private static dagLogger = new DebouncedDagLogger(
    HermesMastraOrchestrator.dagSink,
    {
      debounceMs: Number(process.env.PARENT_ATLAS_DAG_LOG_DEBOUNCE_MS || 250),
      maxPending: Number(process.env.PARENT_ATLAS_DAG_LOG_MAX_PENDING || 1000)
    }
  );

  /**
   * Main orchestration entry point
   */
  static async orchestrate(query: HermesQuery): Promise<HermesResult> {
    const startMs = Date.now();
    const planStartMs = performance.now();

    try {
      // Step 1: Try Mastra agent planner
      if (this.MASTRA_ENABLED) {
        const decision = await this.planWithMastra(query);
        const aceContext = await assembleACEContext({
          query: query.query,
          userId: query.userId,
          caseId: query.caseId,
          conversationId: query.sessionId,
          filePath: query.fileContext,
          enableCodebaseContext: true,
          mode: 'parent_atlas',
        });
        const packetInputs = derivePacketInputsFromAceContext(aceContext);
        const execStartMs = performance.now();

        // Step 2: Execute via the packet consumer pipeline + MCP tool bridge
        const pipeline = await runPacketConsumerPipeline({
          requestId: `hermes_${Date.now()}`,
          packets: packetInputs,
          tokenBudget: Number(process.env.HERMES_PACKET_TOKEN_BUDGET || 4800),
          maxPackets: Number(process.env.HERMES_PACKET_MAX_PACKETS || 6),
          rankingPolicyVersion: 'hermes.packet.rank.v1',
          assemblyPolicyVersion: 'hermes.packet.assembly.v1',
          availableTools: decision.selectedTools.length > 0 ? decision.selectedTools : ['karpathy.attention_rank_files'],
          toolPolicyVersion: 'hermes.packet.tool.v1',
          toolSelector: (manifest, availableTools, policyVersion) => {
            const toolName = decision.selectedTools[0] ?? availableTools[0];
            return {
              toolName,
              toolArguments: {
                ...(decision.toolArguments[0] ?? { query: query.query }),
                requestId: manifest.requestId,
                selectedPacketKeys: manifest.selectedPacketKeys,
                manifestHash: manifest.manifestHash,
              },
              supportingPacketKeys: [...manifest.selectedPacketKeys],
              policyVersion,
              reasons: [decision.reasoning, 'hermes-packet-consumer'],
            };
          },
          executeMcp: async (toolDecision) =>
            this.executeSingleToolViaMcp(toolDecision.toolName, toolDecision.toolArguments, query),
          synthesize: async (manifest, receipt, toolResult) =>
            this.synthesizeResult(query, decision, [
              {
                tool: receipt.toolName,
                args: receipt.supportingPacketKeys,
                status: toolResult.status === 'SUCCESS' ? 'executed' : 'error',
                result: toolResult.output ?? toolResult.error ?? null,
                cached: false,
                receipt,
              },
            ]),
          now: new Date(),
        });
        const execMs = performance.now() - execStartMs;

        // Step 3: Synthesis
        const synthesis = pipeline.synthesis;

        return {
          decision,
          executionPath: 'mastra',
          toolResults: [
            {
              tool: pipeline.toolDecision.toolName,
              args: pipeline.toolDecision.toolArguments,
              status: pipeline.toolExecution.status === 'SUCCESS' ? 'executed' : 'error',
              result: pipeline.toolExecution.output ?? pipeline.toolExecution.error ?? null,
              cached: false,
              receipt: pipeline.toolReceipt,
            },
          ],
          synthesis,
          timing: {
            planningMs: performance.now() - planStartMs,
            executionMs: execMs,
            totalMs: Date.now() - startMs,
          },
        };
      } else {
        throw new Error('Mastra disabled, falling back to Gemma4');
      }
    } catch (err) {
      // Fallback to Gemma4 llama-server
      console.log(`[Hermes] Mastra failed (${err instanceof Error ? err.message : 'unknown'}), falling back to Gemma4`);
      return this.planAndExecuteWithGemma4(query, Date.now() - startMs);
    }
  }

  /**
   * Plan using Mastra agent (decompose intent, select tools)
   */
  private static async planWithMastra(query: HermesQuery): Promise<HermesDecision> {
    // Placeholder: import Mastra framework and invoke planner agent
    // For now, return a mock decision that demonstrates the expected structure

    const mockDecision: HermesDecision = {
      selectedTools: [],
      toolArguments: [],
      reasoning: '[Mastra planning not yet integrated; using static route]',
    };

    // Route based on detected intent
    if (query.intent === 'rank' || query.query.includes('rank') || query.query.includes('top')) {
      mockDecision.selectedTools = ['karpathy.attention_rank_files'];
      mockDecision.toolArguments = [{ query: query.query, limit: 10 }];
      mockDecision.reasoning = 'Intent detected: ranking. Using attention_rank_files (Karpathy GPU).';
    } else if (query.intent === 'search' || query.query.includes('search') || query.query.includes('find')) {
      mockDecision.selectedTools = [
        'topology.language_distribution',
        'karpathy.som_topology_stats',
      ];
      mockDecision.toolArguments = [
        { limit: 5 },
        { metric: 'all' },
      ];
      mockDecision.reasoning = 'Intent detected: search. Using language distribution + SOM topology.';
    } else if (query.intent === 'plan' || query.query.includes('plan') || query.query.includes('how')) {
      mockDecision.selectedTools = ['research.playbook_lookup_by_language'];
      mockDecision.toolArguments = [{ language: 'typescript', limit: 5 }];
      mockDecision.reasoning = 'Intent detected: planning. Using playbook lookup for examples.';
    } else if (query.intent === 'analyze') {
      mockDecision.selectedTools = [
        'karpathy.attention_rank_files',
        'topology.language_distribution',
      ];
      mockDecision.toolArguments = [
        { query: query.query, limit: 5 },
        { limit: 3 },
      ];
      mockDecision.reasoning = 'Intent detected: analysis. Using attention rank + language distribution.';
    } else {
      mockDecision.selectedTools = ['karpathy.attention_rank_files'];
      mockDecision.toolArguments = [{ query: query.query, limit: 10 }];
      mockDecision.reasoning = 'Auto-intent: defaulting to attention rank.';
    }

    return mockDecision;
  }

  /**
   * Execute tools via MCP server (paperclip tool definitions)
   */
  private static async executeToolsViaMcp(decision: HermesDecision): Promise<any[]> {
    const results: any[] = [];
    const workflowId = `hermes_${Date.now()}`;
    const runId = `run_${Math.random().toString(36).slice(2, 9)}`;

    // Log start of tool execution phase
    await this.dagLogger.log({
      workflowId,
      runId,
      kind: 'progress',
      level: 'info',
      message: `Executing ${decision.selectedTools.length} tool(s) via MCP`,
      attributes: {
        toolCount: decision.selectedTools.length,
        tools: decision.selectedTools,
      },
    });

    for (let i = 0; i < decision.selectedTools.length; i++) {
      const toolName = decision.selectedTools[i];
      const args = decision.toolArguments[i] || {};

      try {
        const mcpData = await this.executeSingleToolViaMcp(toolName, args);
        results.push({
          tool: toolName,
          args,
          status: mcpData.status === 'SUCCESS' ? 'executed' : 'error',
          result: mcpData.output || mcpData.error,
          cached: false,
        });
      } catch (err) {
        await this.dagLogger.log({
          workflowId,
          runId,
          nodeId: toolName,
          kind: 'error',
          level: 'error',
          message: `Tool execution failed: ${err instanceof Error ? err.message : 'unknown'}`,
          attributes: { tool: toolName, errorType: err instanceof Error ? err.constructor.name : 'unknown' },
        });

        results.push({
          tool: toolName,
          args,
          status: 'error',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    // Log completion of tool execution phase
    const executedCount = results.filter(r => r.status === 'executed').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    await this.dagLogger.log({
      workflowId,
      runId,
      kind: 'state_transition',
      level: 'info',
      message: `Tool execution complete: ${executedCount} succeeded, ${errorCount} failed`,
      attributes: {
        from_state: 'planning',
        to_state: 'tool_execution_complete',
        executedCount,
        errorCount,
        totalTools: decision.selectedTools.length,
      },
    });

    return results;
  }

  private static async executeSingleToolViaMcp(
    toolName: string,
    args: Record<string, any>,
    query?: HermesQuery
  ): Promise<{ executionId: string; status: 'SUCCESS' | 'FAILED' | 'UNAVAILABLE' | 'TIMEOUT'; output?: unknown; error?: string; toolRevision?: string }> {
    const mcpServerUrl = process.env.TRACE_MCP_URL || 'http://127.0.0.1:8788/mcp';
    const mcpRes = await fetch(`${mcpServerUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `hermes_${Date.now()}_${toolName}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!mcpRes.ok) {
      throw new Error(`MCP server returned ${mcpRes.status} for tool ${toolName}`);
    }

    const mcpData = (await mcpRes.json()) as any;
    return {
      executionId: String(mcpData.id ?? `mcp_${Date.now()}`),
      status: mcpData.error ? 'FAILED' : 'SUCCESS',
      output: mcpData.result ?? undefined,
      error: mcpData.error ? JSON.stringify(mcpData.error) : undefined,
      toolRevision: query?.fileContext ?? undefined,
    };
  }

  /**
   * Fallback: Plan and execute using Gemma4 llama-server
   */
  private static async planAndExecuteWithGemma4(query: HermesQuery, elapsedMs: number): Promise<HermesResult> {
    const planStartMs = performance.now();

    const prompt = `
You are Hermes, a code assistant agent that plans and executes tool calls.

User Query: ${query.query}

Available tools:
- karpathy.attention_rank_files(query, limit=10): Rank files by attention score
- karpathy.som_topology_stats(metric='all'): Get SOM topology statistics
- topology.language_distribution(language=null, limit=10): Get language distribution
- research.playbook_lookup_by_language(language, topic=null, limit=5): Lookup playbooks

Plan the best tool(s) to call for this query. Return JSON:
{
  "tools": ["tool_name"],
  "arguments": [{}],
  "reasoning": "why these tools"
}
`;

    try {
      const planRes = await fetch(`${this.GEMMA4_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal-iq4xs',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 512,
          stream: false,
        }),
      });

      const planMs = performance.now() - planStartMs;

      if (!planRes.ok) {
        throw new Error(`Gemma4 planning failed: ${planRes.status}`);
      }

      const planData = (await planRes.json()) as any;
      const planText = planData.choices?.[0]?.message?.content || '';

      // Parse decision from Gemma4 response
      const decision: HermesDecision = {
        selectedTools: [],
        toolArguments: [],
        reasoning: planText,
      };

      // Simulate tool execution
      const toolResults = await this.executeToolsViaMcp(decision);

      // Synthesis
      const synthesis = await this.synthesizeResultWithGemma4(query, planText, toolResults);

      return {
        decision,
        executionPath: 'gemma4-primary',
        toolResults,
        synthesis,
        timing: {
          planningMs: planMs,
          executionMs: 0,
          totalMs: elapsedMs + planMs,
        },
      };
    } catch (err) {
      return {
        decision: {
          selectedTools: [],
          toolArguments: [],
          reasoning: 'Hermes fallback failed',
          fallbackReason: err instanceof Error ? err.message : 'unknown error',
        },
        executionPath: 'gemma4-fallback',
        toolResults: [],
        synthesis: `Hermes orchestration failed: ${err instanceof Error ? err.message : 'unknown'}`,
        timing: {
          planningMs: 0,
          executionMs: 0,
          totalMs: Date.now() - (Date.now() - elapsedMs),
        },
      };
    }
  }

  /**
   * Synthesize result with context injection
   */
  private static async synthesizeResult(
    query: HermesQuery,
    decision: HermesDecision,
    toolResults: any[]
  ): Promise<string> {
    // Placeholder: aggregate tool results + context injection for downstream ACE
    const resultSummary = toolResults
      .filter(r => r.status === 'executed')
      .map(r => `${r.tool}: ${JSON.stringify(r.result).slice(0, 100)}...`)
      .join('; ');

    return `Hermes Plan: ${decision.reasoning}\nExecution: ${resultSummary}`;
  }

  /**
   * Synthesize result using Gemma4
   */
  private static async synthesizeResultWithGemma4(
    query: HermesQuery,
    planning: string,
    toolResults: any[]
  ): Promise<string> {
    // Placeholder: Gemma4 synthesis
    return `Hermes (Gemma4): ${planning.slice(0, 200)}... [Tool results: ${toolResults.length} items]`;
  }
}
