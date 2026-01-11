# Local-First AI Agent Stack: CrewAI + AutoGen + GraphRAG + Langfuse

**Date:** January 10, 2026
**Status:** Phase 95 Configuration Complete
**Cost:** $0/month (100% local, uses Ollama)

---

## 🎯 Overview

This document outlines the local-first AI agent stack for YoRHa Legal AI, replacing cloud-dependent solutions (Vertex AI, ADK, LangGraph) with 100% self-hosted, open-source alternatives.

### Stack Summary

| Component | Purpose | Alternative To | License |
|-----------|---------|----------------|---------|
| **CrewAI** | Role-based agent pipelines | LangGraph, ADK SequentialAgent | MIT |
| **AutoGen** | Multi-agent conversation | ADK LlmAgent | MIT |
| **GraphRAG** | Knowledge graph + RAG | Neo4j + manual RAG | MIT |
| **Langfuse** | LLM observability | LangSmith | MIT |
| **FastMCP** | Tool registry/middleware | Existing | MIT |
| **Ollama** | Local LLM inference | OpenAI, Vertex AI | MIT |

---

## 🚀 Installation

### Python Environment
```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows

# Install all frameworks
pip install crewai crewai-tools pyautogen graphrag langfuse

# Verify installation
python -c "import crewai; import autogen; import graphrag; import langfuse; print('✅ All installed')"
```

### Ollama Configuration
```bash
# Ensure Ollama is running
ollama serve

# Pull required models
ollama pull gemma3-legal:latest     # Or your custom model
ollama pull nomic-embed-text:latest  # For embeddings
```

### Environment Variables
```bash
# .env.local-agents
export OPENAI_API_BASE=http://localhost:11434/v1
export OPENAI_API_KEY=ollama
export OPENAI_MODEL_NAME=gemma3-legal:latest

# Langfuse (if self-hosted)
export LANGFUSE_HOST=http://localhost:3000
export LANGFUSE_PUBLIC_KEY=pk-local
export LANGFUSE_SECRET_KEY=sk-local
```

---

## 🤖 CrewAI (Production Pipelines)

### When to Use
- Structured, role-based workflows
- Document processing pipelines (DAG)
- Predictable, auditable execution
- Production-grade business processes

### Legal Research Crew
```python
# scripts/crewai/legal_research_crew.py
from crewai import Agent, Task, Crew, Process
from crewai_tools import tool

# Custom tools wrapping FastMCP
@tool
def kb_vector_search(query: str) -> str:
    """Search the legal knowledge base using vector similarity"""
    import httpx
    response = httpx.post("http://localhost:3003/tool/kb_vector_search",
                          json={"query": query})
    return response.json()

@tool
def graph_cypher_query(cypher: str) -> str:
    """Execute Cypher query on legal knowledge graph"""
    import httpx
    response = httpx.post("http://localhost:3003/tool/graph_cypher_query",
                          json={"cypher": cypher})
    return response.json()

# Define agents
legal_researcher = Agent(
    role='Senior Legal Researcher',
    goal='Find comprehensive case law and precedents relevant to the query',
    backstory='''You are a senior legal researcher with 20 years of experience
    in case law research. You specialize in finding relevant precedents
    and understanding legal context.''',
    tools=[kb_vector_search, graph_cypher_query],
    llm='ollama/gemma3-legal:latest',
    verbose=True,
    allow_delegation=False
)

document_analyst = Agent(
    role='Document Analyst',
    goal='Extract key entities, relationships, and legal concepts from research',
    backstory='''You are an expert in legal document analysis, specializing
    in extracting structured information from unstructured legal text.''',
    tools=[],
    llm='ollama/gemma3-legal:latest',
    verbose=True
)

report_writer = Agent(
    role='Legal Report Writer',
    goal='Synthesize research into clear, actionable legal reports',
    backstory='You write clear, well-structured legal reports with proper citations.',
    tools=[],
    llm='ollama/gemma3-legal:latest',
    verbose=True
)

# Define tasks
research_task = Task(
    description='''Research case law and precedents for: {case_type} in {jurisdiction}.
    Focus on:
    - Relevant statutes and regulations
    - Key precedent cases
    - Recent rulings (last 5 years)
    ''',
    expected_output='Comprehensive list of relevant cases with citations and brief summaries',
    agent=legal_researcher
)

analysis_task = Task(
    description='''Analyze the research findings and extract:
    - Key legal entities (parties, courts, judges)
    - Legal concepts and doctrines
    - Relationships between cases
    ''',
    expected_output='Structured analysis with entities and relationships',
    agent=document_analyst,
    context=[research_task]
)

report_task = Task(
    description='''Create a comprehensive legal research report including:
    - Executive summary
    - Key findings
    - Relevant precedents with analysis
    - Recommended next steps
    ''',
    expected_output='Well-formatted legal research report',
    agent=report_writer,
    context=[research_task, analysis_task]
)

# Create crew
legal_research_crew = Crew(
    agents=[legal_researcher, document_analyst, report_writer],
    tasks=[research_task, analysis_task, report_task],
    process=Process.sequential,
    verbose=True
)

if __name__ == "__main__":
    result = legal_research_crew.kickoff(inputs={
        'case_type': 'intellectual property trademark infringement',
        'jurisdiction': 'Texas federal courts'
    })
    print(result)
```

### Run Crew
```bash
python scripts/crewai/legal_research_crew.py
```

---

## 🔬 AutoGen (Research & Conversation)

### When to Use
- Emergent, conversation-driven collaboration
- Rapid prototyping
- Complex problems with unclear solution paths
- Research and experimentation

### Multi-Agent Debate
```python
# scripts/autogen/legal_debate.py
import autogen

# Configure for local Ollama
llm_config = {
    "config_list": [{
        "model": "gemma3-legal:latest",
        "base_url": "http://localhost:11434/v1",
        "api_key": "ollama"
    }],
    "cache_seed": None,
    "temperature": 0.7
}

# Plaintiff's Attorney
plaintiff_attorney = autogen.AssistantAgent(
    name="PlaintiffAttorney",
    llm_config=llm_config,
    system_message="""You are an aggressive plaintiff's attorney.
    Your goal is to argue forcefully for the plaintiff's case.
    Use precedents and legal doctrine to support your arguments.
    Be specific and cite hypothetical case law when relevant."""
)

# Defense Attorney
defense_attorney = autogen.AssistantAgent(
    name="DefenseAttorney",
    llm_config=llm_config,
    system_message="""You are a skilled defense attorney.
    Your goal is to counter the plaintiff's arguments.
    Find weaknesses in their case and present alternative interpretations.
    Be thorough and cite relevant defenses."""
)

# Judge/Moderator
judge = autogen.AssistantAgent(
    name="Judge",
    llm_config=llm_config,
    system_message="""You are an impartial federal judge.
    Your role is to:
    1. Listen to both sides' arguments
    2. Ask clarifying questions
    3. Point out procedural issues
    4. Eventually render a preliminary opinion
    Keep the debate focused and professional."""
)

# User proxy (initiates conversation)
user_proxy = autogen.UserProxyAgent(
    name="LegalResearcher",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=0,
    code_execution_config=False
)

# Group chat setup
groupchat = autogen.GroupChat(
    agents=[user_proxy, plaintiff_attorney, defense_attorney, judge],
    messages=[],
    max_round=8,
    speaker_selection_method="round_robin"
)

manager = autogen.GroupChatManager(
    groupchat=groupchat,
    llm_config=llm_config
)

if __name__ == "__main__":
    # Start the debate
    user_proxy.initiate_chat(
        manager,
        message="""
        Case: TechCorp vs. InnovateSoft
        Issue: Patent infringement claim regarding a machine learning algorithm
        Context: TechCorp holds patent #12345 for "AI-based document classification"
                 InnovateSoft released a competing product 6 months ago

        Begin the legal debate. Plaintiff's Attorney, please present your opening argument.
        """
    )
```

---

## 📊 Microsoft GraphRAG

### When to Use
- Complex documents requiring entity relationship understanding
- Community-level summarization
- Questions requiring global knowledge synthesis
- Better than vanilla RAG for "what is the main theme" questions

### Setup
```bash
# Create GraphRAG project
mkdir -p graphrag/legal-knowledge
cd graphrag/legal-knowledge
graphrag init --root .
```

### Configuration (settings.yaml)
```yaml
# graphrag/legal-knowledge/settings.yaml
llm:
  type: openai_chat
  model: gemma3-legal:latest
  api_base: http://localhost:11434/v1
  api_key: ollama
  max_tokens: 4096
  temperature: 0.0

embeddings:
  type: openai_embedding
  model: nomic-embed-text:latest
  api_base: http://localhost:11434/v1
  api_key: ollama

storage:
  type: file
  base_dir: ./output

input:
  type: file
  base_dir: ./input
  file_pattern: ".*\\.(txt|md|pdf)$"

chunks:
  size: 1200
  overlap: 100

entity_extraction:
  max_gleanings: 1

claim_extraction:
  enabled: true
  max_gleanings: 1

community_reports:
  max_length: 2000
  max_input_length: 8000
```

### Indexing Documents
```bash
# Add documents to input folder
cp /path/to/legal/documents/*.txt graphrag/legal-knowledge/input/

# Run indexing (builds knowledge graph)
graphrag index --root ./graphrag/legal-knowledge

# This creates:
# - Entity nodes (people, organizations, concepts)
# - Relationship edges
# - Community clusters
# - Community summaries
```

### Querying
```bash
# Global search (community summaries - good for "what is" questions)
graphrag query \
  --root ./graphrag/legal-knowledge \
  --method global \
  --query "What are the main intellectual property issues in the corpus?"

# Local search (entity-focused - good for specific questions)
graphrag query \
  --root ./graphrag/legal-knowledge \
  --method local \
  --query "What cases involve TechCorp?"
```

### FastMCP Integration
```python
# scripts/mcp/tools/graphrag_tool.py
import pandas as pd
from graphrag.query.llm.oai.chat_openai import ChatOpenAI
from graphrag.query.structured_search.global_search import GlobalSearch
from graphrag.query.structured_search.local_search import LocalSearch

async def graphrag_search(query: str, method: str = 'global') -> dict:
    """Search legal knowledge using GraphRAG"""

    # Load pre-built index
    entity_df = pd.read_parquet("graphrag/legal-knowledge/output/entities.parquet")
    relationship_df = pd.read_parquet("graphrag/legal-knowledge/output/relationships.parquet")

    llm = ChatOpenAI(
        model="gemma3-legal:latest",
        api_base="http://localhost:11434/v1",
        api_key="ollama"
    )

    if method == 'global':
        community_df = pd.read_parquet("graphrag/legal-knowledge/output/communities.parquet")
        search = GlobalSearch(
            llm=llm,
            context_builder=context_builder,
            community_reports=community_df
        )
    else:
        search = LocalSearch(
            llm=llm,
            context_builder=context_builder,
            entities=entity_df,
            relationships=relationship_df
        )

    result = await search.asearch(query)
    return {
        'response': result.response,
        'sources': result.context_data
    }
```

---

## 🔍 Langfuse (LLM Observability)

### When to Use
- Debugging LLM calls
- Monitoring token usage and costs
- Evaluating response quality
- A/B testing prompts

### Self-Hosted Setup
```bash
# docker/langfuse.yml
version: '3.8'
services:
  langfuse:
    image: langfuse/langfuse:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/langfuse
      - NEXTAUTH_SECRET=your-secret-here
      - NEXTAUTH_URL=http://localhost:3000
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=langfuse
    volumes:
      - langfuse_data:/var/lib/postgresql/data

volumes:
  langfuse_data:
```

### Start Langfuse
```bash
docker-compose -f docker/langfuse.yml up -d
# Access at http://localhost:3000
```

### Python SDK Integration
```python
# scripts/observability/langfuse_integration.py
from langfuse import Langfuse
from langfuse.decorators import observe, langfuse_context

# Initialize client
langfuse = Langfuse(
    public_key="pk-local",
    secret_key="sk-local",
    host="http://localhost:3000"
)

@observe()
def search_legal_database(query: str):
    """Traced search function"""
    langfuse_context.update_current_trace(
        name="legal_search",
        metadata={"query": query, "source": "kb_vector_search"}
    )

    # Your search logic
    results = kb_vector_search(query)

    langfuse_context.update_current_observation(
        output={"result_count": len(results)},
        usage={
            "input_tokens": len(query.split()),
            "output_tokens": sum(len(r.split()) for r in results)
        }
    )

    return results

@observe()
def legal_research_pipeline(case_type: str, jurisdiction: str):
    """Full pipeline with nested traces"""

    # Step 1: Search (creates child span)
    search_results = search_legal_database(f"{case_type} {jurisdiction}")

    # Step 2: Analyze (creates child span)
    analysis = analyze_documents(search_results)

    # Step 3: Generate report (creates child span)
    report = generate_report(analysis)

    return report
```

### View Traces
```bash
# Open browser
open http://localhost:3000

# Navigate to Traces to see:
# - Request timeline
# - Token usage
# - Latency metrics
# - Error rates
```

---

## 📦 Package.json Scripts

```json
{
  "scripts": {
    "crew:legal": "python scripts/crewai/legal_research_crew.py",
    "crew:document": "python scripts/crewai/document_pipeline.py",
    "autogen:debate": "python scripts/autogen/legal_debate.py",
    "graphrag:init": "graphrag init --root ./graphrag/legal-knowledge",
    "graphrag:index": "graphrag index --root ./graphrag/legal-knowledge",
    "graphrag:query": "graphrag query --root ./graphrag/legal-knowledge",
    "langfuse:start": "docker-compose -f docker/langfuse.yml up -d",
    "langfuse:stop": "docker-compose -f docker/langfuse.yml down",
    "langfuse:logs": "docker-compose -f docker/langfuse.yml logs -f"
  }
}
```

---

## 💰 Cost Comparison

| Solution | Monthly Cost | Notes |
|----------|--------------|-------|
| **This Stack** | **$0** | 100% local, uses Ollama |
| Vertex AI + ADK | $50-500 | Cloud-dependent |
| LangChain + LangSmith | $40-200 | Trace fees + LLM API |
| OpenAI Assistants | $100-1000 | Per-token pricing |

**Annual Savings:** $600-12,000

---

## 🔗 Reference Links

| Resource | URL |
|----------|-----|
| CrewAI Docs | https://docs.crewai.com/ |
| AutoGen Docs | https://microsoft.github.io/autogen/ |
| GraphRAG Repo | https://github.com/microsoft/graphrag |
| Langfuse Docs | https://langfuse.com/docs |
| FastMCP Repo | https://github.com/jlowin/fastmcp |
| Ollama | https://ollama.com/ |

---

## ✅ Next Steps

1. **Install dependencies:** `pip install crewai pyautogen graphrag langfuse`
2. **Configure Ollama:** Ensure `gemma3-legal:latest` is pulled
3. **Start Langfuse:** `docker-compose -f docker/langfuse.yml up -d`
4. **Index documents:** `graphrag index --root ./graphrag/legal-knowledge`
5. **Run first crew:** `python scripts/crewai/legal_research_crew.py`

