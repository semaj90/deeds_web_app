# LangGraph.js API Reference (Offline)

> Pulled from installed `@langchain/langgraph` v1.2.7 + official docs
> Last updated: April 2026

---

## Table of Contents

1. [Package Exports](#package-exports)
2. [Annotation & State Definition](#annotation--state-definition)
3. [StateGraph](#stategraph)
4. [createReactAgent (Prebuilt)](#createreactagent-prebuilt)
5. [RunnableConfig & recursionLimit](#runnableconfig--recursionlimit)
6. [PregelOptions (invoke/stream config)](#pregeloptions-invokestream-config)
7. [LangGraphRunnableConfig](#langgraphrunnableconfig)
8. [Multi-Agent Supervisor (@langchain/langgraph-supervisor)](#multi-agent-supervisor)
9. [Key Variables & Constants](#key-variables--constants)
10. [Command Class (Advanced Routing)](#command-class)
11. [Patterns & Recipes](#patterns--recipes)

---

## Package Exports

### `@langchain/langgraph` (core)

```
Annotation, AsyncBatchedStore, BaseChannel, BaseCheckpointSaver, BaseLangGraphError,
BaseStore, BinaryOperatorAggregate, Command, CommandInstance, CompiledStateGraph,
END, EmptyChannelError, EmptyInputError, Graph, GraphBubbleUp, GraphInterrupt,
GraphRecursionError, GraphValueError, INTERRUPT, InMemoryStore, InvalidUpdateError,
MemorySaver, MessageGraph, MessagesAnnotation, MessagesValue, MessagesZodMeta,
MessagesZodState, MultipleSubgraphsError, NodeInterrupt, Overwrite, ParentCommand,
REMOVE_ALL_MESSAGES, ReducedValue, RemoteException, START, Send, StateGraph,
StateGraphInputError, StateSchema, UnreachableNodeError, UntrackedValue,
UntrackedValueChannel, addMessages, copyCheckpoint, emptyCheckpoint, entrypoint,
getConfig, getCurrentTaskInput, getJsonSchemaFromSchema, getPreviousState,
getSchemaDefaultGetter, getStore, getSubgraphsSeenSet, getWriter, interrupt,
isCommand, isGraphBubbleUp, isGraphInterrupt, isInterrupted, isParentCommand,
isSerializableSchema, isStandardSchema, messagesStateReducer, pushMessage, task, writer
```

### `@langchain/langgraph/prebuilt`

```
ToolExecutor, ToolNode, createAgentExecutor, createFunctionCallingExecutor,
createReactAgent, createReactAgentAnnotation, toolsCondition, withAgentName
```

---

## Annotation & State Definition

### `Annotation<ValueType, UpdateType>`

Helper that instantiates channels within a StateGraph state.

**Two usage patterns:**

```typescript
// 1. Direct (no reducer) — stores the most recent value
const MyState = Annotation.Root({
  currentOutput: Annotation<string>,
});

// 2. With reducer — applies reducer on node return values
const MyState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left: BaseMessage[], right: BaseMessage | BaseMessage[]) => {
      if (Array.isArray(right)) return left.concat(right);
      return left.concat([right]);
    },
    default: () => [],
  }),
});
```

### `Annotation.Root<StateDefinition>(sd)`

Creates an `AnnotationRoot` wrapping a state definition. Returns an object with:
- `.State` — Full state type (what nodes receive)
- `.Update` — Partial state type (what nodes can return)
- `.Node` — Type for node functions
- `.spec` — The raw state definition

### `SingleReducer<ValueType, UpdateType>`

```typescript
type SingleReducer<ValueType, UpdateType = ValueType> = {
  reducer: BinaryOperator<ValueType, UpdateType>;
  default?: () => ValueType;
} | null;
```

### `MessagesAnnotation` (built-in)

Pre-built annotation for message-based state:
```typescript
import { MessagesAnnotation } from "@langchain/langgraph";
// Equivalent to:
// Annotation.Root({ messages: Annotation<BaseMessage[]>({ reducer: addMessages, default: () => [] }) })
```

---

## StateGraph

A graph whose nodes communicate by reading and writing to shared state.

### Constructor

```typescript
// Pattern 1: Annotation.Root
const graph = new StateGraph(MyAnnotation);

// Pattern 2: With input/output filtering
const graph = new StateGraph(MyAnnotation, {
  input: InputAnnotation,
  output: OutputAnnotation,
});

// Pattern 3: Object init
const graph = new StateGraph({
  state: FullStateSchema,
  input: InputSchema,
  output: OutputSchema,
});

// Pattern 4: Context schema (for static runtime context)
const graph = new StateGraph(MyAnnotation, {
  context: ContextSchema,
});

// Pattern 5: Interrupt + Writer typing
const graph = new StateGraph(MyAnnotation, {
  interrupt: z.string(),  // typed human-in-the-loop
  writer: z.string(),     // typed custom streaming
});
```

### `addNode(key, action, options?)`

```typescript
// Simple node
graph.addNode("myNode", (state) => {
  return { messages: [new AIMessage("hello")] };
});

// With options
graph.addNode("myNode", action, {
  retryPolicy: { maxAttempts: 3 },
  cachePolicy: true,
  input: InputSchema,    // per-node input filtering
  ends: ["nodeA"],       // restrict outgoing edges
  defer: true,           // defer execution
  metadata: { ... },
});

// Batch add (object map)
graph.addNode({ nodeA: fnA, nodeB: fnB });

// Batch add (tuple array)
graph.addNode([
  ["nodeA", fnA, { retryPolicy: ... }],
  ["nodeB", fnB],
]);
```

### `addEdge(startKey, endKey)`

```typescript
graph.addEdge(START, "myNode");           // entry edge
graph.addEdge("myNode", END);             // terminal edge
graph.addEdge("nodeA", "nodeB");          // normal edge
graph.addEdge(["nodeA", "nodeB"], "nodeC");  // fan-in (wait for both)
```

### `addConditionalEdges(source, path, pathMap?)`

```typescript
// With explicit path map
graph.addConditionalEdges("agent", routingFn, {
  continue: "tools",
  end: END,
});

// Without path map (function returns node names directly)
graph.addConditionalEdges("agent", (state) => {
  if (state.shouldEnd) return END;
  return "tools";
});
```

### `addSequence(nodes)`

```typescript
// Add nodes wired in sequence automatically
graph.addSequence([
  ["step1", fn1],
  ["step2", fn2],
  ["step3", fn3],
]);
// Equivalent to: addNode step1, step2, step3 + addEdge step1→step2→step3
```

### `compile(options?)`

```typescript
const compiled = graph.compile({
  checkpointer?: BaseCheckpointSaver | boolean,  // persistence
  store?: BaseStore,                              // cross-thread memory
  cache?: BaseCache,                              // task caching
  interruptBefore?: N[] | "*",                    // human-in-the-loop
  interruptAfter?: N[] | "*",
  name?: string,                                  // graph name
  description?: string,
});
```

Returns `CompiledStateGraph` with `.invoke()`, `.stream()`, `.batch()` methods.

---

## createReactAgent (Prebuilt)

Creates a ready-to-use ReAct agent with tool calling.

> **Note**: Deprecated in `@langchain/langgraph` — moved to `langchain` package.
> Import: `import { createReactAgent } from "@langchain/langgraph/prebuilt";`

### Parameters

```typescript
createReactAgent({
  // REQUIRED
  llm: LanguageModelLike | ((state, runtime) => Promise<LanguageModelLike>),
  tools: ToolNode | (StructuredToolInterface | DynamicTool | RunnableToolLike)[],

  // PROMPT (replaces deprecated messageModifier/stateModifier)
  prompt?: string | SystemMessage | ((state, config) => BaseMessageLike[]) | Runnable,

  // STATE
  stateSchema?: AnnotationRoot,     // custom state beyond messages
  contextSchema?: AnnotationRoot,   // static context type

  // PERSISTENCE
  checkpointSaver?: BaseCheckpointSaver | boolean,  // alias: checkpointer
  checkpointer?: BaseCheckpointSaver | boolean,
  store?: BaseStore,                // cross-thread memory

  // INTERRUPTS (human-in-the-loop)
  interruptBefore?: ("agent" | "tools" | "__start__")[] | "*",
  interruptAfter?: ("agent" | "tools" | "__start__")[] | "*",

  // STRUCTURED OUTPUT
  responseFormat?: ZodSchema | { prompt, schema, strict? } | JSONSchema,

  // HOOKS
  preModelHook?: RunnableLike,   // before LLM call (message trimming, summarization)
  postModelHook?: RunnableLike,  // after LLM call (guardrails, validation)

  // MULTI-AGENT
  name?: string,
  description?: string,
  includeAgentName?: "inline" | undefined,

  // VERSION
  version?: "v1" | "v2",   // v2 = Send API for parallel tool distribution
});
```

### Returns

`CompiledStateGraph` — graph with nodes: `"agent"` (LLM) and `"tools"` (ToolNode).

### Example

```typescript
import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const model = new ChatOllama({ model: "gemma4-rotorquant:latest" });

const searchTool = tool(
  async ({ query }) => `Results for: ${query}`,
  { name: "search", description: "Search", schema: z.object({ query: z.string() }) }
);

const agent = createReactAgent({
  llm: model,
  tools: [searchTool],
  prompt: "You are a legal research assistant.",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "Find Miranda v Arizona" }],
});
```

---

## RunnableConfig & recursionLimit

### Interface

```typescript
interface RunnableConfig<ConfigurableFieldType = Record<string, any>> {
  configurable?: ConfigurableFieldType;
  recursionLimit?: number;      // Default: 25. Max graph steps before error.
  maxConcurrency?: number;
  timeout?: number;             // Milliseconds
  signal?: AbortSignal;
  callbacks?: Callbacks;
  tags?: string[];
  metadata?: Record<string, unknown>;
  runId?: string;
  runName?: string;
}
```

### recursionLimit Explained

- **Default**: 25 steps
- **What counts as a step**: Each node invocation = 1 step. In a ReAct loop:
  - LLM decides → 1 step ("agent" node)
  - Tool executes → 1 step ("tools" node)
  - So 1 "iteration" = 2 steps minimum
- **Formula**: `recursionLimit = maxIterations * 2 + buffer`
  - We use `maxIterations * 3` for safety (accounts for routing + conditional edges)
- **Error**: `GraphRecursionError` when limit exceeded

### Usage

```typescript
// At invoke time
const result = await graph.invoke(input, {
  recursionLimit: 30,   // allow ~15 tool calls
  timeout: 120_000,     // 2 min timeout
});

// At compile time (not directly — it's a runtime option)
// Use invoke/stream options instead
```

### Our Supervisor Fix

```typescript
// In supervisor.ts — each subagent gets its own recursionLimit
const maxIter = this.config.maxIterations ?? 10;
const result = await compiled.invoke(input, {
  recursionLimit: maxIter * 3,  // 30 steps for 10 iterations
});
```

---

## PregelOptions (invoke/stream config)

Full configuration for `graph.invoke()` and `graph.stream()`:

```typescript
interface PregelOptions extends RunnableConfig {
  // STREAMING
  streamMode?: StreamMode | StreamMode[];
  // "values" — complete state after each step (default)
  // "updates" — only state changes
  // "messages" — messages from within nodes
  // "custom" — custom events from nodes
  // "debug" — detailed execution trace

  subgraphs?: boolean;           // include subgraph updates in stream (default: false)
  encoding?: "text/event-stream"; // SSE format

  // KEYS
  inputKeys?: string | string[];  // which channels to read from checkpoint
  outputKeys?: string | string[]; // which channels to include in output

  // INTERRUPTS
  interruptBefore?: string[] | "*";
  interruptAfter?: string[] | "*";

  // PERSISTENCE
  store?: BaseStore;              // cross-thread memory
  cache?: BaseCache;              // task caching

  // DURABILITY
  durability?: "async" | "sync" | "exit";
  // "async" — checkpoint saved asynchronously while next step runs (default)
  // "sync" — checkpoint saved before next step starts
  // "exit" — checkpoint only at graph exit

  // DEBUGGING
  debug?: boolean;                // detailed execution logging (default: false)
  context?: Record<string, any>;  // static context (userId, dbConnection, etc.)
}
```

### StreamMode values

| Mode | Description |
|------|-------------|
| `"values"` | Complete state after each step (default) |
| `"updates"` | Only changed state keys after each step |
| `"messages"` | Messages from within nodes (for streaming LLM tokens) |
| `"custom"` | Custom events emitted via `writer()` |
| `"debug"` | Detailed execution events for tracing |

---

## LangGraphRunnableConfig

Extended config available inside node functions:

```typescript
interface LangGraphRunnableConfig extends RunnableConfig {
  context?: ContextType;            // user-provided static context
  store?: BaseStore;                // persistent key-value store
  writer?: (chunk: unknown) => void; // emit custom stream chunks
  interrupt?: (value: unknown) => unknown; // human-in-the-loop interrupt
}
```

### Using interrupt inside nodes

```typescript
const myNode = async (state, config: LangGraphRunnableConfig) => {
  // Pause execution, return value to user
  const approval = config.interrupt!("Please approve this action");
  // When resumed with Command({ resume: "yes" }), approval = "yes"
  if (approval === "yes") {
    return { messages: [new AIMessage("Approved!")] };
  }
  return { messages: [new AIMessage("Rejected.")] };
};
```

**Warning**: `interrupt()` propagates via `GraphInterrupt` error. Don't catch it in try/catch blocks (or re-throw if caught).

---

## Multi-Agent Supervisor

### `@langchain/langgraph-supervisor` package

First-party library for hierarchical multi-agent systems.

```bash
npm install @langchain/langgraph-supervisor @langchain/langgraph @langchain/core
```

### `createSupervisor(params)`

```typescript
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const mathAgent = createReactAgent({ llm: model, tools: [add, multiply], name: "math" });
const searchAgent = createReactAgent({ llm: model, tools: [webSearch], name: "search" });

const supervisor = createSupervisor({
  agents: [mathAgent, searchAgent],
  llm: model,
  prompt: "You manage a math expert and search expert.",
  outputMode: "full_history" | "last_message",
});

const app = supervisor.compile({
  checkpointer: new MemorySaver(),
  store: new InMemoryStore(),
  name: "my_supervisor",
});

const result = await app.invoke({
  messages: [{ role: "user", content: "What is 2+2 and who is the president?" }],
});
```

### Message History Management

| `outputMode` | Behavior |
|--------------|----------|
| `"full_history"` | Include full message history from each agent |
| `"last_message"` | Include only the final agent response |

### Multi-Level Hierarchies

```typescript
const researchTeam = createSupervisor({
  agents: [researchAgent, mathAgent], llm: model
}).compile({ name: "research_team" });

const writingTeam = createSupervisor({
  agents: [writingAgent, publishingAgent], llm: model
}).compile({ name: "writing_team" });

const topLevel = createSupervisor({
  agents: [researchTeam, writingTeam], llm: model
}).compile({ name: "top_level" });
```

### Our Custom Supervisor (vs first-party)

We built a custom `SupervisorAgent` in `supervisor.ts` instead of using `@langchain/langgraph-supervisor` because:
1. We use Ollama (not OpenAI) — needed custom LLM routing with keyword fallback
2. We have 5 scoped subagents with different tool maps (not just different ReAct agents)
3. We needed tool-based classification (`classifyIntent()`) as fallback when LLM routing fails
4. Each subagent gets its own `createReactAgent` with scoped tools and system prompt

---

## Key Variables & Constants

```typescript
import { START, END, INTERRUPT, MessagesAnnotation } from "@langchain/langgraph";

START    // "__start__" — the entry point of the graph
END      // "__end__" — the terminal point
INTERRUPT // Symbol for interrupt handling

// MessagesAnnotation — pre-built state with messages[] + addMessages reducer
// MessagesZodState — Zod-based equivalent
// REMOVE_ALL_MESSAGES — sentinel to clear all messages from state

import { addMessages } from "@langchain/langgraph";
// Built-in reducer that handles message add/update/remove operations
// Supports: BaseMessage, BaseMessageLike, RemoveMessage
```

---

## Command Class

Advanced routing and state updates from within nodes:

```typescript
import { Command } from "@langchain/langgraph";

// Return a Command from a node to:
// 1. Route to a specific node
// 2. Update state
// 3. Resume from interrupt
const myNode = (state) => {
  return new Command({
    goto: "nextNode",                    // route to specific node
    update: { messages: [...] },         // update state
    resume: "approved",                  // resume interrupted node
  });
};
```

---

## Patterns & Recipes

### Basic ReAct Agent

```typescript
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";

const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: addMessages,
    default: () => [],
  }),
});

const graph = new StateGraph(State)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, {
    continue: "tools",
    end: END,
  })
  .addEdge("tools", "agent")
  .compile();
```

### Supervisor Pattern (Manual)

```typescript
const SupervisorState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: addMessages, default: () => [] }),
  next: Annotation<string>,
});

const graph = new StateGraph(SupervisorState)
  .addNode("route_intent", routeIntentNode)
  .addNode("agent_a", subagentANode)
  .addNode("agent_b", subagentBNode)
  .addEdge(START, "route_intent")
  .addConditionalEdges("route_intent", (s) => s.next, {
    agent_a: "agent_a",
    agent_b: "agent_b",
  })
  .addEdge("agent_a", END)
  .addEdge("agent_b", END)
  .compile({ name: "supervisor" });
```

### Human-in-the-Loop

```typescript
const graph = new StateGraph(State)
  .addNode("agent", agentNode)
  .addNode("human_review", humanReviewNode)
  .addNode("tools", toolNode)
  .compile({
    checkpointer: new MemorySaver(),
    interruptBefore: ["human_review"],
  });

// Invoke — will pause at human_review
const result = await graph.invoke(input, { configurable: { thread_id: "1" } });

// Resume with approval
const resumed = await graph.invoke(
  new Command({ resume: "approved" }),
  { configurable: { thread_id: "1" } }
);
```

### Streaming with SSE

```typescript
const stream = await graph.stream(input, {
  streamMode: "messages",
  encoding: "text/event-stream",
});

for await (const chunk of stream) {
  // chunk contains incremental message tokens
  process.stdout.write(chunk);
}
```

### Custom Stream Events

```typescript
const myNode = async (state, config: LangGraphRunnableConfig) => {
  config.writer!({ type: "progress", value: "Searching..." });
  const results = await search(state.query);
  config.writer!({ type: "progress", value: "Analyzing..." });
  return { results };
};

const stream = await graph.stream(input, { streamMode: ["values", "custom"] });
```

---

## Installed Package Versions

```
@langchain/langgraph: 1.2.7
@langchain/core: 1.0.4
@langchain/ollama: 1.0.1
```

## Source References

- TypeDoc: https://langchain-ai.github.io/langgraphjs/reference/
- Supervisor: https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph-supervisor.html
- GitHub: https://github.com/langchain-ai/langgraphjs
