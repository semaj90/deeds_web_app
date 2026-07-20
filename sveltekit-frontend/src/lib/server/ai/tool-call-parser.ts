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
 */

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

export function parseToolCalls(content: string): ParsedToolCalls {
  const toolCalls: ToolCall[] = [];
  let reasoningText = '';
  let responseText = content;

  // Extract reasoning block
  const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
  if (reasoningMatch) {
    reasoningText = reasoningMatch[1].trim();
  }

  // Extract all tool calls
  const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  let lastIndex = 0;

  while ((match = toolCallRegex.exec(content)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.name) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'function',
          function: {
            name: parsed.name,
            arguments: typeof parsed.arguments === 'string'
              ? parsed.arguments
              : JSON.stringify(parsed.arguments || {}),
          },
        });
      }
    } catch (e) {
      console.warn('[Tool Call Parser] Failed to parse JSON:', jsonStr, e);
    }
    lastIndex = match.index + match[0].length;
  }

  // Clean up response text: remove reasoning and tool_call blocks
  responseText = content
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<result>[\s\S]*?<\/result>/g, '')
    .replace(/\n\n+/g, '\n')
    .trim();

  return {
    toolCalls,
    reasoningText,
    responseText,
  };
}

export function hasToolCalls(content: string): boolean {
  return /<tool_call>[\s\S]*?<\/tool_call>/.test(content);
}
