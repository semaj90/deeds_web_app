// src/agents/gemmaAgent.ts
import fetch from 'node-fetch';
import { ToolCall, ToolResult } from './types';
import { TOOL_REGISTRY, executeToolCall } from './tools';

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest';

const SYSTEM_PROMPT = `
You are an agentic legal/developer assistant running inside a tool-calling framework.

You MUST ALWAYS respond as a single JSON object with this exact structure:
{
  "response": "your natural language response to the user",
  "toolCalls": [
    {
      "tool": "tool_name",
      "arguments": { "arg1": "value1", ... }
    }
  ]
}

Available tools:

- "web_search": { "query": string }
- "rag_lookup": { "query": string, "topK"?: number }
- "web_crawl": { "url": string, "depth"?: number, "maxLinks"?: number }
- "web_doc_summary": { "url": string, "topic"?: string }
- "code_search": { "pattern": string, "path"?: string }

When planning codemods or debugging TypeScript errors, you can:
1. Use rag_lookup to recall how you've fixed similar errors before
2. Use web_crawl to fetch documentation from SvelteKit/TypeScript sites
3. Use web_doc_summary to get README-ready summaries of external docs
4. Combine internal memories with external docs for comprehensive solutions

Always be concise but helpful. Use tools proactively when they would help.
`.trim();

export interface AgentResponse {
  response: string;
  toolCalls: ToolCall[];
}

export async function runGemmaAgent(prompt: string): Promise<AgentResponse> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  const body = {
    model: MODEL,
    messages,
    stream: false,
  };

  const res = await fetch(`${OLLAMA_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama chat error: ${res.status} ${res.statusText} ${t}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? '';

  try {
    const parsed = JSON.parse(content);
    return {
      response: parsed.response || '',
      toolCalls: parsed.toolCalls || []
    };
  } catch {
    // Fallback if not valid JSON
    return {
      response: content,
      toolCalls: []
    };
  }
}

export async function executeAgentWithTools(prompt: string): Promise<{
  response: string;
  toolResults: ToolResult[];
}> {
  const agentResponse = await runGemmaAgent(prompt);
  const toolResults: ToolResult[] = [];

  for (const toolCall of agentResponse.toolCalls) {
    try {
      const result = await executeToolCall(toolCall);
      toolResults.push(result);
    } catch (error) {
      toolResults.push({
        tool: toolCall.tool,
        arguments: toolCall.arguments,
        result: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  return {
    response: agentResponse.response,
    toolResults
  };
}