# Agent Workflow Roadmap

This document outlines the remaining, pending development tasks to complete the agentic workflow enhancements.

## Pending Todo Items
- Tool Selection Logic
- Middleware Parser
- Orchestration Update
- System Instructions Update

## Next Steps
The following actions must be addressed in sequence to finalize the agent's operational intelligence:

1. **Tool Selection Logic**: Implement and refine the logic that determines which specialized tool (e.g., `mcp-toolchain`, `rg-atlas`) to call based on the user's query intent.
2. **Middleware Parser**: Develop a parser to correctly interpret and handle routing logic and data flow through various middleware layers.
3. **Orchestration Update**: Update the primary agent orchestration layer to correctly sequence the Tool Selection Logic and Middleware Parser outputs.
4. **System Instructions Update**: Refine the core system instructions to incorporate the new logic and parser outputs, ensuring consistent behavior across all agent interactions.