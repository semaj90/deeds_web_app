import { suggestFix } from './auto-fix.js';
import { parseToolCall, executeTool } from './tool-shim.js';
import { buildACEPacket, injectACETableCache } from './ace-builder.js';
import { ENV } from '../env.server.js';
import Redis from 'ioredis';

const redis = new Redis(ENV.REDIS_URL || 'redis://127.0.0.1:6379');

function isSuccess(result: string) {
  if (/error|fail|timeout|missing/i.test(result)) return false;
  return true;
}

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

// Simulating synthesis via the shim
async function synthesize(query: string, ctx: any) {
  if (!shouldUseTool(query, ctx)) {
     return "Successful reasoning synthesis for: " + query;
  }

  // Try tool execution if syntax is detected
  const toolCall = parseToolCall(query);
  if (toolCall) {
    const check = preventLoop(toolCall);
    if (check.stop) {
      return "⚠️ Tool loop detected: duplicate_tool_call. Switching to reasoning.";
    }
    const res = await executeTool(toolCall, ctx);
    return JSON.stringify(res);
  }
  
  // If no tool call, simulate successful or failed generation based on context
  if (ctx.strategy === "failure_lookup") {
    return "Error: Infinite loop detected";
  }
  
  return "Successful synthesis for: " + query;
}

export async function runAgentDAG(query: string, ctx: any = {}) {
  const state = {
    query,
    attempts: 0,
    maxAttempts: 3,
    history: [] as string[]
  };

  while (state.attempts < state.maxAttempts) {
    state.attempts++;

    // 0. Build and Inject ACE Packet for this context iteration
    const acePacket = await buildACEPacket(query, ctx);
    await injectACETableCache(query, acePacket);

    // 1. Synthesize (with tool shim intercepted)
    const result = await synthesize(query, ctx);

    // 2. Success path
    if (isSuccess(result)) {
      // 7. REDIS SEMANTIC + EXECUTION CACHE
      await redis.set(`exec:${Buffer.from(query).toString('base64').substring(0, 10)}`, JSON.stringify(result), "EX", 3600);
      return { success: true, result };
    }

    // 3. Retry Strategy Engine
    ctx = adjustStrategy(ctx, result);
    state.history.push(result);
  }

  // 5. FAILURE -> FIX -> RETRY LOOP
  const fix = await suggestFix(query, ctx.atlas || []);

  return {
    success: false,
    error: "Max attempts reached",
    history: state.history,
    suggestedFix: fix
  };
}
