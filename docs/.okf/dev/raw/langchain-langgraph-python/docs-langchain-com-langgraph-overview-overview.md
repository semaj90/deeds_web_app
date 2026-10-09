> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.langchain.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.langchain.com/oss/python/langgraph/overview#content-area)

Trusted by companies shaping the future of agents—including Klarna, Uber, J.P. Morgan, and more—LangGraph is a low-level orchestration framework and runtime for building, managing, and deploying long-running, stateful agents. LangGraph gives you fine-grained control to mix deterministic, hand-coded steps with LLM-driven agentic steps in the same graph, so you can build bespoke agents that behave exactly the way your application requires.LangGraph is very low-level, and focused entirely on agent **orchestration**. Before using LangGraph, we recommend you familiarize yourself with some of the components used to build agents, starting with [models](https://docs.langchain.com/oss/python/langchain/models) and [tools](https://docs.langchain.com/oss/python/langchain/tools).We will commonly use [LangChain](https://docs.langchain.com/oss/python/langchain/overview) components throughout the documentation to integrate models and tools, but you don’t need to use LangChain to use LangGraph. If you are just getting started with agents or want a higher-level abstraction, we recommend you use LangChain’s [agents](https://docs.langchain.com/oss/python/langchain/agents) that provide prebuilt architectures for common LLM and tool-calling loops.LangGraph is focused on the underlying capabilities important for agent orchestration: durable execution, streaming, human-in-the-loop, and more.One of LangGraph’s core strengths is the ability to mix deterministic steps with LLM-driven agentic steps in a single graph. This lets you build bespoke workflows where parts of the logic are fully predictable and auditable while other parts are flexible and model-driven, giving you fine-grained control over exactly where and how AI is applied.

Showhow LangChain products fit together

- [Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview) is an [agent harness](https://docs.langchain.com/oss/python/concepts/products#agent-harnesses-like-the-deep-agents-sdk): planning, subagents, filesystem tools, and context management on top of LangGraph.
- [LangChain](https://docs.langchain.com/oss/python/langchain/overview) is the agent framework: abstractions and integrations for models, tools, and agent loops.
- [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) is the orchestration runtime: durable execution, streaming, human-in-the-loop, and persistence.
- [LangSmith](https://docs.langchain.com/langsmith/observability) is the platform for tracing, evaluation, prompts, and deployment across frameworks.
- [LangSmith Engine](https://docs.langchain.com/langsmith/engine) detects issues in your LangGraph agent traces and proposes fixes. You can open a pull request with the proposed fix directly from the Engine tab.
- [LangSmith Fleet](https://docs.langchain.com/langsmith/fleet/index) is the no-code agent builder for templates, integrations, and routine automation.

Read [Frameworks, runtimes, and harnesses](https://docs.langchain.com/oss/python/concepts/products) for a comparison of the open source stack.

## [​](https://docs.langchain.com/oss/python/langgraph/overview\#install)   Install

pip

uv

```
pip install -U langgraph
```

```
uv add langgraph
```

Then, create a simple hello world example:

```
from langgraph.graph import StateGraph, MessagesState, START, END

def mock_llm(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "hello world"}]}

graph = StateGraph(MessagesState)
graph.add_node(mock_llm)
graph.add_edge(START, "mock_llm")
graph.add_edge("mock_llm", END)
graph = graph.compile()

graph.invoke({"messages": [{"role": "user", "content": "hi!"}]})
```

Use [LangSmith](https://docs.langchain.com/langsmith/observability) to trace requests, debug agent behavior, and evaluate outputs. Set `LANGSMITH_TRACING=true` and your API key to get started. Follow the [tracing quickstart](https://docs.langchain.com/langsmith/trace-with-langchain) to get set up. We recommend you also set up [LangSmith Engine](https://docs.langchain.com/langsmith/engine) which monitors your traces, detects issues, and proposes fixes.

## [​](https://docs.langchain.com/oss/python/langgraph/overview\#core-benefits)  Core benefits

LangGraph provides low-level supporting infrastructure for _any_ long-running, stateful workflow or agent. LangGraph does not abstract prompts or architecture, and provides the following central benefits:

- **Mix deterministic and agentic steps**: Combine hand-coded, deterministic logic with LLM-driven decision-making in a single graph. Use deterministic steps where you need reliability and predictability, and agentic steps where you need flexibility—giving you precise control over every part of your agent’s behavior.
- [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence): Build agents that persist through failures and can run for extended periods, resuming from where they left off.
- [Human-in-the-loop](https://docs.langchain.com/oss/python/langgraph/interrupts): Incorporate human oversight by inspecting and modifying agent state at any point.
- [Comprehensive memory](https://docs.langchain.com/oss/python/concepts/memory): Create stateful agents with both short-term working memory for ongoing reasoning and long-term memory across sessions.
- [Debugging with LangSmith](https://docs.langchain.com/langsmith/observability): Gain deep visibility into complex agent behavior with visualization tools that trace execution paths, capture state transitions, and provide detailed runtime metrics.
- [Production-ready deployment](https://docs.langchain.com/langsmith/deployment): Deploy sophisticated agent systems confidently with scalable infrastructure designed to handle the unique challenges of stateful, long-running workflows.

## [​](https://docs.langchain.com/oss/python/langgraph/overview\#langgraph-ecosystem)  LangGraph ecosystem

While LangGraph can be used standalone, it also integrates seamlessly with any LangChain product, giving developers a full suite of tools for building agents. To improve your LLM application development, pair LangGraph with:

[![](https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/observability-icon-dark.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=ccbc183bca2a5e4ca78d30149e3836cc)\\
\\
**LangSmith Observability** \\
\\
Trace requests, evaluate outputs, and monitor deployments in one place. Prototype locally with LangGraph, then move to production with integrated observability and evaluation to build more reliable agent systems.\\
\\
Learn more](https://docs.langchain.com/langsmith/observability)

[![](https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/deployment-icon-dark.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=024e3712d388bfa55f4f160cc9d6a85b)\\
\\
**LangSmith Deployment** \\
\\
Deploy and scale agents effortlessly with a purpose-built deployment platform for long running, stateful workflows. Discover, reuse, configure, and share agents across teams — and iterate quickly with visual prototyping in Studio.\\
\\
Learn more](https://docs.langchain.com/langsmith/deployment)

[![](https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/langchain-icon.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=663b30f85baf99ad708b97e05da2a5a4)\\
\\
**LangChain** \\
\\
Provides integrations and composable components to streamline LLM application development. Contains agent abstractions built on top of LangGraph.\\
\\
Learn more](https://docs.langchain.com/oss/python/langchain/overview)

## [​](https://docs.langchain.com/oss/python/langgraph/overview\#acknowledgements)  Acknowledgements

LangGraph is inspired by [Pregel](https://research.google/pubs/pub37252/) and [Apache Beam](https://beam.apache.org/). The public interface draws inspiration from [NetworkX](https://networkx.org/documentation/latest/). LangGraph is built by LangChain Inc, the creators of LangChain, but can be used without LangChain.

* * *

[Connect these docs](https://docs.langchain.com/use-these-docs) to your agent of choice via MCP for real-time answers.

[Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/overview.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).

Was this page helpful?

YesNo