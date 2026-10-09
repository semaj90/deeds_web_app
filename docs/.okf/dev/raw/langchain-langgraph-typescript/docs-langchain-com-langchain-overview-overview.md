> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.langchain.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.langchain.com/oss/javascript/langchain/overview#content-area)

**Agent = Model + Harness.** LangChain provides `create_agent`: a minimal, highly configurable harness. The harness is everything around the model loop: the prompt, the tools, and any middleware that shapes behavior. Start with the primitives and compose exactly what your use case needs. Supports [OpenAI, Anthropic, Google, and more](https://docs.langchain.com/oss/javascript/integrations/providers/overview).

**LangChain vs. LangGraph vs. Deep Agents**Start with [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview) for a “batteries-included” agent with features like automatic context compression, a virtual filesystem, and subagent-spawning. Deep Agents are built on LangChain [agents](https://docs.langchain.com/oss/javascript/langchain/agents) which you can also use directly.Use [LangChain](https://docs.langchain.com/oss/javascript/langchain/agents) (`create_agent`) for a highly customizable harness, easily tailored to your use case and data.Use [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview), our low-level orchestration framework, for advanced needs combining deterministic and agentic workflows.Use [LangSmith](https://docs.langchain.com/langsmith/observability) to trace, debug, and evaluate agents built with any of these frameworks. Follow the [tracing quickstart](https://docs.langchain.com/langsmith/trace-with-langchain) to get set up. We recommend you also set up [LangSmith Engine](https://docs.langchain.com/langsmith/engine) which monitors your traces, detects issues, and proposes fixes.

## [​](https://docs.langchain.com/oss/javascript/langchain/overview\#create-an-agent)   Create an agent

This example demonstrates how to create a simple LangChain agent with a custom tool:

OpenAI

Google Gemini

Claude (Anthropic)

OpenRouter

Fireworks

Baseten

Ollama

Azure

AWS Bedrock

```
// First install: npm install langchain zod @langchain/openai
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "gpt-5.5",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod @langchain/google
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "google:gemini-2.5-flash-lite",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod @langchain/anthropic
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "claude-sonnet-4-6",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod @langchain/openrouter
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "openrouter:anthropic/claude-sonnet-4-6",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "fireworks:accounts/fireworks/models/qwen3p5-397b-a17b",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "baseten:zai-org/GLM-5.2",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod @langchain/ollama
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "ollama:devstral-2",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod @langchain/openai
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "azure_openai:gpt-5.5",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

```
// First install: npm install langchain zod @langchain/aws
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  model: "bedrock:gpt-5.5",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
  })
);
```

See the [Installation instructions](https://docs.langchain.com/oss/javascript/langchain/install) and [Quickstart guide](https://docs.langchain.com/oss/javascript/langchain/quickstart) to get started building your own agents and applications with LangChain.

Use [LangSmith](https://docs.langchain.com/langsmith/observability) to trace requests, debug agent behavior, and evaluate outputs. Set `LANGSMITH_TRACING=true` and your API key to get started.

## [​](https://docs.langchain.com/oss/javascript/langchain/overview\#core-benefits)   Core benefits

[**Standard model interface** \\
\\
Use one interface for chat models, embeddings, and more across providers. Switch models with minimal code changes and keep your application portable as requirements evolve.\\
\\
Learn more](https://docs.langchain.com/oss/javascript/langchain/models)

[**Highly configurable harness** \\
\\
Start with `create_agent` as a minimal harness and add capabilities incrementally through middleware. Compose only what your use case needs, from guardrails and retries to routing and custom tool policies.\\
\\
Learn more](https://docs.langchain.com/oss/javascript/langchain/agents)

[![](https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/langgraph-icon.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=b997e1a7487d507a36556eedbfd99f81)\\
\\
**Built on top of LangGraph** \\
\\
LangChain’s agents are built on top of LangGraph. This allows us to take advantage of LangGraph’s durable execution, human-in-the-loop support, persistence, and more.\\
\\
Learn more](https://docs.langchain.com/oss/javascript/langgraph/overview)

[![](https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/observability-icon-dark.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=ccbc183bca2a5e4ca78d30149e3836cc)\\
\\
**Debug with LangSmith** \\
\\
Inspect traces, tool calls, state transitions, and latency in one place. Find failure modes, evaluate quality, and improve agent behavior with execution data.\\
\\
Learn more](https://docs.langchain.com/langsmith/observability)

* * *

[Connect these docs](https://docs.langchain.com/use-these-docs) to your agent of choice via MCP for real-time answers.

[Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langchain/overview.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).

Was this page helpful?

YesNo