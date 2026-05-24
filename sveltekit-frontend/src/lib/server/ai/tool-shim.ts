export function parseToolCall(text: string) {
  // Matches <|tool_call>call:tool_name{"arg": "value"} OR call:tool_name(args)
  
  // Try OpenCode / Gemma standard first
  let match = text.match(/<\|tool_call\|>call:(\w+)(.*?)$/m);
  if (!match) {
    // Try regex from Phase 9 spec
    match = text.match(/call:(\w+)\((.*?)\)/);
  }
  
  if (!match) return null;

  let argsStr = match[2] || "{}";
  let args = {};
  
  try {
    // Sometimes Gemma outputs Markdown JSON
    argsStr = argsStr.replace(/```json/g, '').replace(/```/g, '').trim();
    args = JSON.parse(argsStr);
  } catch (err) {
    console.warn("Failed to parse tool call args:", argsStr);
  }

  return {
    tool: match[1],
    args: args
  };
}

export async function executeTool(call: { tool: string; args: any }, context?: any) {
  const { tool_graph_expand_neighborhood, tool_codebase_rg_search, tool_search_hybrid } = await import('./mcp-tool-dispatch.js');
  
  switch (call.tool) {
    case "rg_search":
      return tool_codebase_rg_search(call.args);

    case "graph_expand":
      return tool_graph_expand_neighborhood(call.args);

    case "atlas_lookup":
    case "search.hybrid":
      return tool_search_hybrid ? tool_search_hybrid(call.args) : null;

    default:
      return null;
  }
}
