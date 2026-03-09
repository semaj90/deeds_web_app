---
mode: agent
---

Define the task to achieve, including specific requirements, constraints, and success criteria.

# Context7 Keywords for Copilot

Use these keywords to trigger Context7 MCP tools:

- #context7 - Access Context7 documentation
- #get-library-docs sveltekit2 - Get SvelteKit 2 docs
- #get-library-docs bitsui - Get Bits UI docs
- #resolve-library-id - Find library identifiers
- #directory_tree - Show project structure
- #read_multiple_files - Read multiple files
- #microsoft-docs - Access Microsoft documentation

## Memory Keywords

- #memory - Access memory system
- #create_entities - Create knowledge graph entities
- #create_relations - Create entity relationships
- #read_graph - Read knowledge graph
- #search_nodes - Search memory nodes

## Bits UI + SvelteKit 2

// defaults overridden by incoming props (explicit merge order)
const defaults = { size: 'md', variant: 'primary' };
const merged = { ...defaults, ...incomingProps };

// or pick explicit props to forward
const { size = 'md', variant = 'primary', ...rest } = incomingProps;
# Run MCP tools: concurrency index + graph read

#tool: mcp concurrency index read_graph
#targets: #memory, #file:mcp-context7-assistant, #file:8_12_25_9pm_multi-coreprocessor.txt

Task:
- Execute read_graph on the project's memory and the two attached files to extract entities and relations relevant to concurrency, orchestration, MCP server, and VSCode extension integration.
- Compute a "concurrencyIndex" that scores components by concurrency risk/opportunity (0-10).
- Produce a short actionable summary and prioritized recommendations to improve concurrency & orchestration (max 6 bullets).

Output format (JSON):
{
  "entities": [ ... ],           // extracted entity summaries (name, type, short description)
  "relations": [ ... ],          // key relations relevant to concurrency/orchestration
  "concurrencyIndex": {          // numeric score per component and rationale
    "componentName": { "score": 0-10, "reason": "..." }
  },
  "recommendations": [ ... ],    // up to 5 prioritized, actionable items (commands/code changes)
  "quickCommands": [ ... ]       // explicit shell/npm/go commands to run for fixes or diagnostics
}

Constraints:
- Use only the provided memory and files referenced in #targets.
- Keep JSON compact and machine-parseable.
- If a missing dependency or fatal error is discovered, include exact install/fix commands.

Success criteria:
- JSON validates and contains at least one entity, one relation, a concurrencyIndex entry for the MCP server and for the orchestration components, and 1–3 high-priority recommendations.
