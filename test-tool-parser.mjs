// Manual test of tool-call parser logic

const content = `<reasoning>
The user has explicitly requested to know the current time.
The available tool \`get_time\` is designed to provide this information.
Therefore, I should call the \`get_time\` tool.
</reasoning>
<tool_call>
{"name": "get_time", "arguments": {}}
</tool_call>
<tool_output>
{"time": "14:30:45"}
</tool_output>
<reasoning>
I have successfully called the \`get_time\` tool and received the current time: "14:30:45".
I should now present this information clearly to the user to fulfill the request.
</reasoning>
<tool_call>
{"name": "respond", "arguments": {"text": "The current time is 14:30:45."}}
</tool_call>`;

function parseToolCalls(content) {
  const toolCalls = [];
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
      console.warn('Failed to parse JSON:', jsonStr, e);
    }
  }

  // Clean up response text
  responseText = content
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
    .replace(/<tool_output>[\s\S]*?<\/tool_output>/g, '')
    .replace(/\n\n+/g, '\n')
    .trim();

  return {
    toolCalls,
    reasoningText,
    responseText,
  };
}

// Test
const result = parseToolCalls(content);
console.log('✅ Tool Call Parser Test');
console.log('Tool calls found:', result.toolCalls.length);
result.toolCalls.forEach((tc, i) => {
  console.log(`  [${i}] ${tc.function.name}: ${tc.function.arguments}`);
});
console.log('\n📝 Reasoning (first 100 chars):', result.reasoningText.slice(0, 100));
console.log('📄 Response (first 100 chars):', result.responseText.slice(0, 100));
