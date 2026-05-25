import { StateGraph, END } from "@langchain/langgraph";
import { suggestFix } from './auto-fix.js';
import { parseToolCall, executeTool } from './tool-shim.js';
import { buildACEPacket, injectACETableCache } from './ace-builder.js';
import { recordExecutionOutcome, mutatePromptWithLearnings } from './learning-loop.js';
import { logSynthesisRun } from '../observability/synthesis-logger.js';
import { ENV } from '../env.server.js';
import Redis from 'ioredis';
import crypto from 'crypto';

const redis = new Redis(ENV.REDIS_URL || 'redis://127.0.0.1:6379');

function canonicalJson(obj: any): string {
  if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
  if (Array.isArray(obj)) return JSON.stringify(obj.map((item: any) => JSON.parse(canonicalJson(item))));
  const keys = Object.keys(obj).sort();
  const sortedObj: any = {};
  for (const key of keys) {
    sortedObj[key] = JSON.parse(canonicalJson(obj[key]));
  }
  return JSON.stringify(sortedObj);
}

function hashContent(content: any): string {
  const str = typeof content === 'string' ? content : canonicalJson(content);
  return crypto.createHash('sha256').update(str).digest('hex');
}

// --- State Definition ---
export type AgentState = {
  query: string;
  ctx: any;
  history: string[];
  attempts: number;
  maxAttempts: number;
  lastResult: string;
  success: boolean;
  suggestedFix?: string;
  hasLookedUpFailure?: boolean;
};

// --- Utilities ---
function adjustStrategy(ctx: any, result: string) {
  if (result.includes("duplicate_tool_call")) {
    ctx.strategy = "no_tools";
  } else if (/timeout/i.test(result)) {
    ctx.strategy = "reduce_context";
  } else if (/missing/i.test(result)) {
    ctx.strategy = "rg_search";
  } else if (/loop/i.test(result)) {
    ctx.strategy = "failure_lookup";
  }
  return ctx;
}

function shouldUseTool(query: string, ctx: any) {
  if (ctx.strategy === "no_tools") return false;
  if (/search|find|rg/i.test(query)) return false;
  if (/graph|expand|neighbors/i.test(query)) return true;
  if (/error|fail/.test(query)) return false;
  return false;
}

const seenToolCalls = new Set<string>();

function preventLoop(toolCall: any) {
  const key = JSON.stringify(toolCall);
  if (seenToolCalls.has(key)) {
    return { stop: true, reason: "duplicate_tool_call" };
  }
  seenToolCalls.add(key);
  return { stop: false };
}

// --- Nodes ---
async function synthesizeNode(state: AgentState): Promise<Partial<AgentState>> {
  const normalizedUserQuery = state.query.trim().toLowerCase();
  const queryHash = hashContent(normalizedUserQuery);
  
  // Phase 8B: check llm_output
  const cachedLlmOutput = await redis.get(`llm_output:${queryHash}`);
  if (cachedLlmOutput) {
    state.ctx.cacheLayerUsed = 'llm_output';
    return {
      lastResult: cachedLlmOutput,
      history: [...state.history, cachedLlmOutput],
      attempts: state.attempts + 1,
      ctx: adjustStrategy(state.ctx, cachedLlmOutput)
    };
  }

  // Phase 8B: check semantic:bifrost
  const stablePrefix = {
    systemPrompt: state.ctx.systemPrompt || "System: You are a legal AI.",
    modelId: state.ctx.modelId || "gemma4-tq",
    stablePolicy: state.ctx.stablePolicy || "Strict adherence to legal texts"
  };
  
  const dynamicSuffix = {
    query: state.query,
    timestamp: state.ctx.runId || Date.now()
  };

  const prefixHash = hashContent(stablePrefix);
  const suffixHash = hashContent(dynamicSuffix);
  const modelId = stablePrefix.modelId;
  const cachedBifrost = await redis.get(`semantic:bifrost:${modelId}:${prefixHash}:${suffixHash}`);
  
  if (cachedBifrost) {
    state.ctx.cacheLayerUsed = 'bifrost_semantic';
    return {
      lastResult: cachedBifrost,
      history: [...state.history, cachedBifrost],
      attempts: state.attempts + 1,
      ctx: adjustStrategy(state.ctx, cachedBifrost)
    };
  }

  state.ctx.cacheLayerUsed = 'none';

  // Phase 10: Mutate prompt based on historical outcomes before synthesis
  const mutatedQuery = await mutatePromptWithLearnings(state.query, state.ctx.intent || 'default');

  // 0. Build and Inject ACE Packet for this context iteration using the mutated prompt
  const acePacket = await buildACEPacket(mutatedQuery, state.ctx);
  await injectACETableCache(mutatedQuery, acePacket);

  // 1. Synthesize reasoning vs tool
  let result = "";
  if (!shouldUseTool(state.query, state.ctx)) {
     result = "Successful reasoning synthesis for: " + state.query;
  } else {
    const toolCall = parseToolCall(state.query);
    if (toolCall) {
      const check = preventLoop(toolCall);
      if (check.stop) {
        result = "⚠️ Tool loop detected: duplicate_tool_call. Switching to reasoning.";
      } else {
        const res = await executeTool(toolCall, state.ctx);
        result = JSON.stringify(res);
      }
    } else {
      if (state.ctx.strategy === "failure_lookup") {
        result = "Error: Infinite loop detected";
      } else {
        result = "Successful synthesis for: " + state.query;
      }
    }
  }

  return {
    lastResult: result,
    history: [...state.history, result],
    attempts: state.attempts + 1,
    ctx: adjustStrategy(state.ctx, result) // Adjust strategy based on this run
  };
}

async function failureLookupNode(state: AgentState): Promise<Partial<AgentState>> {
  const fix = await suggestFix(state.query, state.ctx.atlas || []);
  
  const queryHash = hashContent(state.query.trim().toLowerCase());
  const clusterId = state.ctx.clusterId || `cluster_${queryHash.substring(0, 8)}`;
  const stableKey = state.ctx.stableKey || `path_${queryHash.substring(0, 8)}`;

  // Phase 10: Punish strategy failure in reinforcement loop
  await recordExecutionOutcome(state.query, false, state.ctx);
  
  // Phase 8C/9: Engram ranked reinforcement (Decay)
  const { reinforceEngramPath } = await import('./engram-registry.js');
  await reinforceEngramPath(`memory_${queryHash}`, false, 0.1, clusterId, stableKey);

  return { suggestedFix: fix, success: false, hasLookedUpFailure: true };
}

async function finalizeSuccessNode(state: AgentState): Promise<Partial<AgentState>> {
  const normalizedUserQuery = state.query.trim().toLowerCase();
  const queryHash = hashContent(normalizedUserQuery);
  const clusterId = state.ctx.clusterId || `cluster_${queryHash.substring(0, 8)}`;
  const stableKey = state.ctx.stableKey || `path_${queryHash.substring(0, 8)}`;

  // Phase 8B: Save successful execution cache to llm_output (7 days TTL)
  await redis.set(`llm_output:${queryHash}`, JSON.stringify(state.lastResult), "EX", 3600 * 24 * 7);
  
  // Phase 10: Reward strategy success in reinforcement loop
  await recordExecutionOutcome(state.query, true, state.ctx);

  // Phase 8C/9: Engram ranked reinforcement (Boost)
  const { reinforceEngramPath } = await import('./engram-registry.js');
  await reinforceEngramPath(`memory_${queryHash}`, true, 0.1, clusterId, stableKey);

  // Phase 8B: Log synthesis outcome
  await logSynthesisRun({
    runId: `run-${Date.now()}`,
    queryHash,
    sourceStage: 'langgraph-dag',
    cacheTrace: { layerUsed: state.ctx.cacheLayerUsed || 'none' },
    summary: state.lastResult
  });

  return { success: true };
}

// --- Conditional Edges ---
function evaluateExecution(state: AgentState) {
  const res = state.lastResult;
  
  // Explicit success checking instead of naive regex
  if (res.startsWith("Successful")) {
    return "finalizeSuccess";
  }
  
  if (state.hasLookedUpFailure) {
    return "finalizeFailure"; // We already tried fixing it once, exit now.
  }
  
  if (res.includes("duplicate_tool_call") || res.includes("generic_answer") || res.includes("missing_sourceRefs") || res.includes("Error:") || state.attempts >= state.maxAttempts) {
    return "failureLookup";
  }

  return "synthesize"; // Retry loop
}

// --- Graph Construction ---
const workflow = new StateGraph<AgentState>({
  channels: {
    query: { value: (a, b) => b ?? a },
    ctx: { value: (a, b) => b ?? a },
    history: { value: (a, b) => b ?? a },
    attempts: { value: (a, b) => b ?? a },
    maxAttempts: { value: (a, b) => b ?? a },
    lastResult: { value: (a, b) => b ?? a },
    success: { value: (a, b) => b ?? a },
    suggestedFix: { value: (a, b) => b ?? a },
    hasLookedUpFailure: { value: (a, b) => b ?? a }
  }
});

workflow.addNode("synthesize", synthesizeNode);
workflow.addNode("failureLookup", failureLookupNode);
workflow.addNode("finalizeSuccess", finalizeSuccessNode);

// @ts-expect-error TODO(TS-104): setEntryPoint type signature mismatch in @langchain/langgraph
workflow.setEntryPoint("synthesize");

// @ts-expect-error TODO(TS-107): conditional edge targets don't match strict typing in this version
workflow.addConditionalEdges("synthesize", evaluateExecution, {
  synthesize: "synthesize",
  failureLookup: "failureLookup",
  finalizeSuccess: "finalizeSuccess",
  finalizeFailure: END
});

// @ts-expect-error TODO(TS-105): addEdge requires START/END node identifiers which changed in current version
workflow.addEdge("failureLookup", "synthesize");
// @ts-expect-error TODO(TS-105): addEdge requires START/END node identifiers which changed in current version
workflow.addEdge("finalizeSuccess", END);

const app = workflow.compile();

export async function runAgentDAG(query: string, ctx: any = {}) {
  const initialState: AgentState = {
    query,
    ctx,
    history: [],
    attempts: 0,
    maxAttempts: 3,
    lastResult: "",
    success: false
  };

  const finalState = await app.invoke(initialState);

  return {
    success: finalState.success,
    result: finalState.lastResult,
    history: finalState.history,
    suggestedFix: finalState.suggestedFix
  };
}
