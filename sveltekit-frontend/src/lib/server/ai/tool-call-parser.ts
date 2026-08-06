/**
 * Parse tool calls from Gemma4 output
 *
 * Gemma4 outputs tool calls in this format:
 * <reasoning>
 * I should use the get_time tool
 * </reasoning>
 * <tool_call>
 * {"name": "get_time", "arguments": {"timezone": "UTC"}}
 * </tool_call>
 *
 * Also accepts OpenAI-compatible JSON tool call payloads from:
 * - message.tool_calls[]
 * - choices[0].message.tool_calls[]
 * - plain JSON tool call envelopes
 */

import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ParsedToolCalls {
  toolCalls: ToolCall[];
  reasoningText: string;
  responseText: string;
}

function makeToolCall(name: string, args: unknown): ToolCall | null {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return null;

  return {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'function',
    function: {
      name: trimmed,
      arguments:
        typeof args === 'string' ? args : JSON.stringify(args ?? {}),
    },
  };
}

function parseJsonToolCalls(content: string): {
  toolCalls: ToolCall[];
  responseText: string;
} {
  const trimmed = content.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return { toolCalls: [], responseText: content };
  }

  let parsed: any;
  try {
    parsed = fastJsonParse(trimmed);
  } catch {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { toolCalls: [], responseText: content };
    }
  }

  const candidateMessages = [
    parsed?.choices?.[0]?.message,
    parsed?.message,
    parsed,
  ].filter(Boolean);

  for (const message of candidateMessages) {
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) continue;

    const normalized = toolCalls
      .map((tc: any) =>
        makeToolCall(tc?.function?.name ?? tc?.name ?? '', tc?.function?.arguments ?? tc?.arguments)
      )
      .filter((item: ToolCall | null): item is ToolCall => Boolean(item));

    if (normalized.length > 0) {
      const responseText =
        typeof message?.content === 'string'
          ? message.content.trim()
          : typeof parsed?.choices?.[0]?.message?.content === 'string'
            ? parsed.choices[0].message.content.trim()
            : '';
      return { toolCalls: normalized, responseText };
    }
  }

  return { toolCalls: [], responseText: content };
}

/**
 * Parse a Hermes/Qwen-style <function=name><parameter=key>value</parameter>...</function>
 * body into {name, arguments}. Observed from Ornith (9B, hforf.gguf) 2026-08-06.
 */
function parseHermesFunctionBlock(body: string): { name: string; arguments: Record<string, unknown> } | null {
  const fnMatch = body.match(/^<function=([a-zA-Z_][a-zA-Z0-9_.:-]*)>([\s\S]*?)<\/function>$/);
  if (!fnMatch) return null;

  const name = fnMatch[1];
  const paramBody = fnMatch[2];
  const args: Record<string, unknown> = {};
  const paramRe = /<parameter=([a-zA-Z_][a-zA-Z0-9_]*)>([\s\S]*?)<\/parameter>/g;
  let pm: RegExpExecArray | null;
  while ((pm = paramRe.exec(paramBody)) !== null) {
    const raw = pm[2].trim();
    try {
      args[pm[1]] = JSON.parse(raw);
    } catch {
      args[pm[1]] = raw;
    }
  }
  return { name, arguments: args };
}

export function parseToolCalls(content: string): ParsedToolCalls {
  const toolCalls: ToolCall[] = [];
  let reasoningText = '';
  let responseText = content;

  // Extract reasoning block
  const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
  if (reasoningMatch) {
    reasoningText = reasoningMatch[1].trim();
  }

  // Extract all tool calls. Body may be a JSON object ({"name":...,"arguments":...})
  // or Hermes/Qwen-style XML (<function=name><parameter=k>v</parameter></function>).
  // Only the FIRST well-formed call is taken — a local model can plan several
  // dependent calls in one turn, but later ones likely depend on results it doesn't
  // have yet. The rest are stripped below along with this one so none leak as text.
  const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  let took = false;

  while ((match = toolCallRegex.exec(content)) !== null) {
    if (took) continue;
    const body = match[1].trim();

    if (body.startsWith('<function=')) {
      const parsed = parseHermesFunctionBlock(body);
      const toolCall = parsed && makeToolCall(parsed.name, parsed.arguments);
      if (toolCall) {
        toolCalls.push(toolCall);
        took = true;
      } else {
        console.warn('[Tool Call Parser] Failed to parse Hermes function block:', body);
      }
      continue;
    }

    try {
      const parsed = JSON.parse(body);
      const toolCall = makeToolCall(parsed?.name, parsed?.arguments);
      if (toolCall) {
        toolCalls.push(toolCall);
        took = true;
      }
    } catch (e) {
      console.warn('[Tool Call Parser] Failed to parse JSON:', body, e);
    }
  }

  if (toolCalls.length === 0) {
    const jsonToolCalls = parseJsonToolCalls(content);
    toolCalls.push(...jsonToolCalls.toolCalls);
    if (jsonToolCalls.toolCalls.length > 0) {
      responseText = jsonToolCalls.responseText;
    }
  }

  // Clean up response text: remove reasoning and tool_call blocks
  responseText = content
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<result>[\s\S]*?<\/result>/g, '')
    .replace(/\n\n+/g, '\n')
    .trim();

  if (toolCalls.length > 0) {
    const jsonToolCallResponse = parseJsonToolCalls(content);
    if (jsonToolCallResponse.toolCalls.length > 0) {
      responseText = jsonToolCallResponse.responseText;
    }
  }

  return {
    toolCalls,
    reasoningText,
    responseText,
  };
}

export function hasToolCalls(content: string): boolean {
  return /<tool_call>[\s\S]*?<\/tool_call>/.test(content) || /"tool_calls"\s*:\s*\[/i.test(content);
}
