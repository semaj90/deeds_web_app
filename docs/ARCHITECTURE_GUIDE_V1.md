# Architecture Integration Guide: Component, Data, and State Flow

This document outlines the mandatory architectural patterns for integrating UI components with backend data services within the Deeds Web App, ensuring compliance with Svelte 5 runes, Bits UI v2, and the TRACE MCP contract.

***

## 1. Component Layer Rules (Svelte 5 & Bits UI)

Component development must strictly adhere to the Svelte 5 runes pattern and Bits UI v2 guidelines:

*   **Runes Enforcement**: All component logic must use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props()`, `onclick`) instead of Svelte 4 syntax (`export let`, `$:`, `on:`).
*   **Component Primitives**: When using Bits UI components (e.g., `Dialog`, `Select`), use the component's designated pattern (e.g., `Dialog.Root`) and ensure SSR safety is considered; routes rendering such components may require `export const ssr = false`.
*   **Slots and Snippets**: The `<slot>` tag is deprecated. All content injection must use the `{#snippet}` block, adhering to the `child` snippet pattern when dealing with components that require context propagation.
*   **Styling**: All styling must utilize UnoCSS utility classes. Avoid mixing raw Tailwind CSS classes with UnoCSS definitions.
*   **State/Lifecycle**: Browser-only APIs require wrapping within `onMount` or explicit `typeof window !== 'undefined'` checks to maintain SSR compatibility.

## 2. Data Access Rules (MCP $\to$ Gemma4/Trace)

Data fetching must *never* involve direct, raw calls to databases or external services from client-side components. The data flow is strictly mediated by the TRACE MCP layer:

*   **Mandatory Flow**: The pattern is **Component $\to$ Prop/State $\to$ Event $\to$ API Route $\to$ MCP Tool Call $\to$ Gemma4/Trace $\to$ Data**.
*   **MCP as Gateway**: The `trace-mcp-tooling` skill governs all context retrieval. Any need for schema inspection, graph traversal, or metadata lookups must invoke a specific MCP tool (e.g., `trace.kag_search`, `db.table_inspect`) via a dedicated API endpoint.
*   **Context Building**: The client component logic should trigger an API call that internally executes a context-building process, which utilizes `context.build_kv_packet` to generate a compact, queryable context card before any data is processed by the UI.

## 3. State Management Cross-Boundary Rules

Handling state that originates from a server-side data fetch (via MCP) and is consumed in the client requires explicit boundary management:

*   **Client State Source**: Local component state should be managed using `$state()` for immediate, in-memory changes.
*   **Data Ingestion**: Data retrieved via the MCP flow should be treated as external, read-only context unless explicitly marked as mutable. The pattern of setting state from an API response must be handled using dedicated form/action wrappers (e.g., integrating `superValidate` results or using a custom `$derived` getter that calls a local, memoized data loader).
*   **Transitions**: State transitions that depend on asynchronous data fetching must be managed via a controlled state machine pattern, often leveraging `use:action` wrappers or `$effect` blocks that observe data loading flags, ensuring UI components remain stable during asynchronous updates.

## 4. Tooling Integration Pattern Example

When a component needs data derived from a complex graph query (e.g., finding related deeds), the flow must follow this pattern:

1.  **Component Trigger**: User interaction triggers a data fetch request in the Svelte component.
2.  **API Handler Execution**: The endpoint handler executes a call to the MCP layer, simulating a graph search:
    *   *Internal Action:* Calls `graph.expand_neighborhood(file="deeds_id:123", depth=2)` via a registered MCP tool.
    *   *Result:* The tool returns a context packet containing neighboring file paths and associated metadata.
3.  **Component Consumption**: The component receives this context data as a prop or state. It then uses `$derived` to process the raw context, displaying the results using Bits UI components, ensuring the rendering respects the `child` snippet pattern for any embedded interactive elements.