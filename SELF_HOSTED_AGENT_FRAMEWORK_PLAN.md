# Self-Hosted Agentic Framework Integration Plan
## Phase 96+: AutoGen + CrewAI + GraphRAG + LangExtract

**Status**: ✅ Foundation Ready | **Date**: January 10, 2026

---

## 🎯 Executive Summary

**Decision**: Focus on **self-hosted** agentic frameworks to avoid vendor lock-in and maintain data sovereignty.

**Removed**:
- ❌ Vertex AI + Google ADK (cloud pricing: $595-$43K/month)
- ❌ LangGraph + LangSmith (managed platform costs)

**Retained**:
- ✅ **AutoGen** (Microsoft) - Multi-agent conversational framework
- ✅ **CrewAI** - Task-based agent orchestration
- ✅ **GraphRAG** (Microsoft) - Knowledge graph-enhanced RAG
- ✅ **LangExtract** - Already integrated (Phase 46, gemma3-legal:latest)

**Infrastructure** (Already Running):
- Ollama (localhost:11434) - gemma3-legal:latest, embeddinggemma:latest
- Qdrant (localhost:6333) - Vector search (RAG)
- Neo4j (localhost:7687) - Knowledge graph (KAG)
- PostgreSQL (localhost:5434) - Relational data + pgvector
- Redis (localhost:6379) - Caching + KAG patterns
- MinIO (localhost:9000) - Document storage with SIMD

**Cost Model**: Self-hosted = Infrastructure only (no SaaS fees)

---

## 📦 Existing Integrations (Foundation)

### 1. **FastMCP Server** (Production-Ready)
**File**: `mcp/legal_ai_mcp_server.py` (452 lines)

**10 Registered Tools**:
```python
@mcp.tool()
async def get_document_chunks(doc_id: str, bucket: str = "legal-documents")
    # MinIO SIMD integration (AVX2-optimized)

@mcp.tool()
async def get_case_evidence_metadata(case_id: str)
    # Parallel evidence fetching (16 concurrent goroutines)

@mcp.tool()
async def rag_vector_search(query: str, top_k: int = 5)
    # Qdrant semantic search

@mcp.tool()
async def neo4j_graph_query(cypher: str)
    # Neo4j KAG traversal
```

**Deployment**: Port 3003 (FastMCP server active)

---

### 2. **LangExtract Integration** (Phase 46)
**File**: `python_codebase/data_ingestion/phase46_adapter_doc_ingest.py` (520 lines)

**LangExtract Model**: gemma3-legal:latest (Ollama)

**Extraction Schema**:
```python
LANGEXTRACT_PROMPT = """
Extract relevant error-code context, file path, type system rule, and suggested fix.
Use JSON output adhering to schema:
{
  "error_code": string,
  "file_path": string,
  "rule": string,
  "suggested_fix": string
}
"""

LANGEXTRACT_EXAMPLES = [
  lx.data.ExampleData(
    text="TS2322: Type 'number' is not assignable to type 'string' in file src/lib/button.ts",
    extractions=[
      lx.data.Extraction(
        extraction_class="error_code",
        extraction_text="TS2322",
        attributes={"offset_start": 0, "offset_end": 6}
      ),
      # ... file_path, rule, suggested_fix
    ]
  )
]
```

**Usage**: Document ingestion → LangExtract → Chunks → Embeddings → Qdrant

**Endpoints**:
- `/crawl` - Web crawling with LangExtract parsing
- `/extract` - Direct text extraction
- `/query` - Search indexed knowledge base

---

### 3. **RAG/KAG/DAG Pipeline** (Phase 72-90)
**Key Files**:
- `scripts/rag-kag-ast-integrator.mjs` - AST knowledge base loader
- `scripts/contextual-prompt-engineer.mjs` - Self-prompting agent
- `backend/scripts/phase90_rag_query.py` - RAG query interface

**Collections** (Qdrant):
- `phase72_ast_knowledge_base` - AST graph embeddings
- `phase89_code_units` - SvelteKit routes + components
- `phase90_fix_recommendations` - Proven fix patterns
- `phase90_cuda_embeddings` - GPU-accelerated error clusters

**Knowledge Graph** (Neo4j):
- Error patterns → Fix strategies
- File dependencies → Import relationships
- Type hierarchies → Migration patterns

**PostgreSQL** (pgvector):
- `knowledge_base` - RAG document chunks
- `raw_error_embeddings` - Error cluster data
- `successful_patches` - Proven fixes (GRPO learning)

**Redis** (KAG Patterns):
- 14 high-confidence patterns (95%+)
- 7-day TTL for embeddings
- SHA-256 change detection cache

---

### 4. **Agent Stubs** (Ready for Implementation)
**File**: `src/lib/services/agent-stubs.ts` (Production placeholders)

```typescript
export const autoGenAgent = {
  runTask: async (_input: AgentInput) => ({ success: true, output: 'autogen stub output' }),
  execute: async (_input: AgentInput): Promise<AgentExecutionResult> => ({
    output: 'AutoGen agent executed successfully',
    score: 0.8,
    metadata: { agent: 'autogen', timestamp: new Date().toISOString() },
  }),
};

export const crewAIAgent = {
  executeMission: async (_mission: Mission): Promise<MissionResult> => ({
    success: true,
    steps: [],
  }),
  execute: async (_input: AgentInput): Promise<AgentExecutionResult> => ({
    output: 'CrewAI agent executed successfully',
    score: 0.75,
    metadata: { agent: 'crewai', timestamp: new Date().toISOString() },
  }),
};
```

**Current Status**: Stubs return mock data - **READY FOR REAL IMPLEMENTATION**

---

## 🚀 Phase 96: AutoGen Integration

### AutoGen Architecture
**Microsoft's Multi-Agent Framework** - Conversational agent pattern

**Key Features**:
- **Conversable Agents**: Human-AI or AI-AI interactions
- **Tool Calling**: Integration with FastMCP tools
- **Group Chat**: Multi-agent coordination
- **Human-in-the-Loop**: Optional approval gates
- **Code Execution**: Sandboxed code validation

### Implementation Plan

#### Step 1: Install AutoGen
```powershell
# Activate Python virtual environment
.venv\Scripts\Activate.ps1

# Install AutoGen with all dependencies
pip install pyautogen[lmm,retrievechat,mathchat,gemini]

# Verify installation
python -c "import autogen; print(autogen.__version__)"
```

#### Step 2: Configure LLM Backend
**File**: `backend/config/autogen_llm_config.py` (NEW)

```python
import os
from typing import Dict, List

# Ollama configuration for AutoGen
OLLAMA_CONFIG = {
    "config_list": [
        {
            "model": "gemma3-legal:latest",
            "api_key": "ollama",  # Placeholder (Ollama doesn't use keys)
            "base_url": "http://localhost:11434/v1",  # OpenAI-compatible endpoint
            "api_type": "openai",
        }
    ],
    "temperature": 0.7,
    "cache_seed": None,  # Disable caching for development
    "timeout": 120,
}

# Tool execution config
AUTOGEN_TOOLS_CONFIG = {
    "timeout": 60,
    "work_dir": "autogen_workspace",
    "use_docker": False,  # Set True for sandboxed execution
}

def get_autogen_config() -> Dict:
    """Get AutoGen configuration for legal AI agents"""
    return {
        **OLLAMA_CONFIG,
        "functions": get_fastmcp_tools(),
        "tools": AUTOGEN_TOOLS_CONFIG,
    }

def get_fastmcp_tools() -> List[Dict]:
    """Convert FastMCP tools to AutoGen function calling format"""
    return [
        {
            "name": "rag_vector_search",
            "description": "Search legal knowledge base using semantic similarity",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "top_k": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
        },
        {
            "name": "neo4j_graph_query",
            "description": "Query Neo4j knowledge graph with Cypher",
            "parameters": {
                "type": "object",
                "properties": {
                    "cypher": {"type": "string", "description": "Cypher query"},
                },
                "required": ["cypher"],
            },
        },
        # Add all 10 FastMCP tools
    ]
```

#### Step 3: Create Legal Agent Team
**File**: `backend/agents/autogen_legal_team.py` (NEW)

```python
import autogen
from backend.config.autogen_llm_config import get_autogen_config

class LegalAgentTeam:
    """AutoGen multi-agent team for legal case analysis"""

    def __init__(self):
        config = get_autogen_config()

        # 1. Legal Researcher Agent
        self.researcher = autogen.AssistantAgent(
            name="legal_researcher",
            llm_config=config,
            system_message="""You are a legal research specialist.
            Your role: Search case law, statutes, and legal precedents.
            Use rag_vector_search to find relevant legal documents.
            Cite sources with precision.""",
        )

        # 2. Evidence Analyst Agent
        self.analyst = autogen.AssistantAgent(
            name="evidence_analyst",
            llm_config=config,
            system_message="""You are an evidence analysis expert.
            Your role: Evaluate admissibility, chain of custody, and relevance.
            Use neo4j_graph_query to trace evidence relationships.
            Apply Federal Rules of Evidence (FRE).""",
        )

        # 3. Case Strategist Agent
        self.strategist = autogen.AssistantAgent(
            name="case_strategist",
            llm_config=config,
            system_message="""You are a legal strategy coordinator.
            Your role: Synthesize research and evidence into actionable plans.
            Coordinate between researcher and analyst.
            Generate comprehensive case briefs.""",
        )

        # 4. Human Proxy (Optional approval)
        self.human_proxy = autogen.UserProxyAgent(
            name="human_attorney",
            human_input_mode="TERMINATE",  # Auto-approve unless termination needed
            max_consecutive_auto_reply=10,
            code_execution_config={"work_dir": "autogen_workspace", "use_docker": False},
        )

    async def analyze_case(self, case_id: str, query: str) -> Dict:
        """Run multi-agent case analysis"""
        # Create group chat
        groupchat = autogen.GroupChat(
            agents=[self.researcher, self.analyst, self.strategist, self.human_proxy],
            messages=[],
            max_round=20,
        )

        manager = autogen.GroupChatManager(groupchat=groupchat, llm_config=get_autogen_config())

        # Initiate conversation
        initial_message = f"""Case ID: {case_id}
        Task: {query}

        Legal Researcher: Search relevant case law.
        Evidence Analyst: Evaluate evidentiary strength.
        Case Strategist: Synthesize findings into strategy."""

        result = await self.human_proxy.initiate_chat(
            manager,
            message=initial_message,
        )

        return {
            "case_id": case_id,
            "agents_involved": ["legal_researcher", "evidence_analyst", "case_strategist"],
            "conversation": result.chat_history,
            "final_strategy": result.summary,
        }
```

#### Step 4: FastAPI Endpoint Integration
**File**: `backend/api/autogen_routes.py` (NEW)

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.agents.autogen_legal_team import LegalAgentTeam

router = APIRouter(prefix="/api/autogen", tags=["AutoGen Agents"])

class CaseAnalysisRequest(BaseModel):
    case_id: str
    query: str
    max_rounds: int = 20

legal_team = LegalAgentTeam()

@router.post("/analyze-case")
async def analyze_case(request: CaseAnalysisRequest):
    """Run AutoGen multi-agent case analysis"""
    try:
        result = await legal_team.analyze_case(
            case_id=request.case_id,
            query=request.query,
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## 🎯 Phase 97: CrewAI Integration

### CrewAI Architecture
**Task-Based Agent Orchestration** - Sequential/hierarchical workflows

**Key Features**:
- **Crews**: Teams of agents with defined roles
- **Tasks**: Specific objectives with success criteria
- **Tools**: Integration with external APIs
- **Memory**: Shared context across agents
- **Sequential/Hierarchical Execution**

### Implementation Plan

#### Step 1: Install CrewAI
```powershell
pip install crewai crewai-tools

# Verify installation
python -c "import crewai; print(crewai.__version__)"
```

#### Step 2: Create Legal Investigation Crew
**File**: `backend/agents/crewai_investigation_team.py` (NEW)

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import tool
import httpx

# Define custom tools (wrapper for FastMCP)
@tool("RAG Search")
def rag_search(query: str) -> str:
    """Search legal knowledge base"""
    response = httpx.post(
        "http://localhost:3003/mcp/rag_vector_search",
        json={"query": query, "top_k": 5},
    )
    return response.json()["results"]

@tool("Graph Query")
def graph_query(cypher: str) -> str:
    """Query Neo4j knowledge graph"""
    response = httpx.post(
        "http://localhost:3003/mcp/neo4j_graph_query",
        json={"cypher": cypher},
    )
    return response.json()["results"]

class LegalInvestigationCrew:
    """CrewAI team for legal investigation workflows"""

    def __init__(self):
        # Agent 1: Document Analyst
        self.document_analyst = Agent(
            role="Document Analyst",
            goal="Extract key facts from legal documents",
            backstory="""Expert in document review with 15 years experience.
            Specializes in identifying critical evidence and inconsistencies.""",
            tools=[rag_search],
            verbose=True,
        )

        # Agent 2: Timeline Constructor
        self.timeline_builder = Agent(
            role="Timeline Specialist",
            goal="Construct chronological sequence of events",
            backstory="""Former investigator with expertise in timeline analysis.
            Uses graph relationships to identify temporal patterns.""",
            tools=[graph_query],
            verbose=True,
        )

        # Agent 3: Report Generator
        self.report_writer = Agent(
            role="Report Writer",
            goal="Synthesize findings into investigative report",
            backstory="""Legal writer with experience in investigation documentation.
            Creates clear, actionable reports for attorneys.""",
            tools=[],  # No tools needed (synthesis only)
            verbose=True,
        )

    def investigate_case(self, case_id: str, case_description: str) -> str:
        """Run investigation workflow"""
        # Task 1: Analyze documents
        analyze_task = Task(
            description=f"""Analyze all documents for Case {case_id}.
            Focus on: {case_description}
            Extract key facts, dates, and involved parties.""",
            agent=self.document_analyst,
            expected_output="List of key facts with source citations",
        )

        # Task 2: Build timeline
        timeline_task = Task(
            description=f"""Construct timeline for Case {case_id}.
            Use facts from document analysis.
            Query knowledge graph for event relationships.""",
            agent=self.timeline_builder,
            expected_output="Chronological timeline with date ranges",
        )

        # Task 3: Generate report
        report_task = Task(
            description=f"""Create investigation report for Case {case_id}.
            Synthesize document analysis and timeline.
            Include recommendations for next steps.""",
            agent=self.report_writer,
            expected_output="Comprehensive investigation report (Markdown format)",
        )

        # Create crew with sequential execution
        crew = Crew(
            agents=[self.document_analyst, self.timeline_builder, self.report_writer],
            tasks=[analyze_task, timeline_task, report_task],
            process=Process.sequential,  # Execute tasks in order
            verbose=2,
        )

        # Execute workflow
        result = crew.kickoff()
        return result
```

#### Step 3: FastAPI Integration
**File**: Update `backend/api/crewai_routes.py` (NEW)

```python
from fastapi import APIRouter
from backend.agents.crewai_investigation_team import LegalInvestigationCrew

router = APIRouter(prefix="/api/crewai", tags=["CrewAI Agents"])

investigation_crew = LegalInvestigationCrew()

@router.post("/investigate")
async def run_investigation(case_id: str, case_description: str):
    """Run CrewAI investigation workflow"""
    report = investigation_crew.investigate_case(case_id, case_description)
    return {"success": True, "report": report}
```

---

## 🧠 Phase 98: GraphRAG Integration

### GraphRAG Architecture
**Microsoft's Knowledge Graph-Enhanced RAG**

**Key Features**:
- **Hierarchical Clustering**: Entity resolution + community detection
- **Graph Indexing**: Knowledge graph construction from documents
- **Query-Focused Summarization**: LLM-generated graph summaries
- **Global vs Local Search**: Graph-wide vs entity-focused retrieval

### Implementation Plan

#### Step 1: Install GraphRAG
```powershell
pip install graphrag

# Create GraphRAG workspace
mkdir graphrag_workspace
cd graphrag_workspace
graphrag init --root ./
```

#### Step 2: Configure for Legal Domain
**File**: `graphrag_workspace/.env`

```env
GRAPHRAG_LLM_MODEL=gemma3-legal:latest
GRAPHRAG_LLM_API_BASE=http://localhost:11434/v1
GRAPHRAG_LLM_API_TYPE=openai
GRAPHRAG_EMBEDDING_MODEL=embeddinggemma:latest
GRAPHRAG_EMBEDDING_API_BASE=http://localhost:11434/v1

# Graph database (use existing Neo4j)
GRAPHRAG_STORAGE_TYPE=neo4j
GRAPHRAG_STORAGE_URI=bolt://localhost:7687
GRAPHRAG_STORAGE_USER=neo4j
GRAPHRAG_STORAGE_PASSWORD=legal123456
```

**File**: `graphrag_workspace/settings.yaml`

```yaml
llm:
  model: gemma3-legal:latest
  api_base: http://localhost:11434/v1
  api_type: openai
  max_tokens: 4096
  temperature: 0.7

embeddings:
  model: embeddinggemma:latest
  api_base: http://localhost:11434/v1
  vector_store: qdrant  # Use existing Qdrant

storage:
  type: neo4j
  uri: bolt://localhost:7687
  database: legal_graphrag

chunks:
  size: 1200
  overlap: 200
  group_by_columns: [file_path, case_id]

entity_extraction:
  entity_types:
    - PERSON
    - ORGANIZATION
    - LOCATION
    - LEGAL_CITATION
    - STATUTE
    - CASE_NUMBER
    - EVIDENCE_ID

community_reports:
  max_length: 2000
  strategy: hierarchical
```

#### Step 3: Index Legal Documents
**File**: `backend/scripts/graphrag_indexer.py` (NEW)

```python
import os
from pathlib import Path
from graphrag.index import create_pipeline_config, run_pipeline_with_config

async def index_legal_documents(input_dir: str, output_dir: str):
    """Index legal documents with GraphRAG"""
    config = create_pipeline_config(root_dir=output_dir)

    # Run indexing pipeline
    result = await run_pipeline_with_config(
        config_or_path=config,
        workflows=["create_base_entity_graph", "create_final_entities", "create_final_communities"],
        root_dir=output_dir,
        input_base_dir=input_dir,
    )

    print(f"✅ GraphRAG indexing complete: {result}")
    return result

# Usage
if __name__ == "__main__":
    import asyncio
    asyncio.run(index_legal_documents(
        input_dir="data/legal_documents",
        output_dir="graphrag_workspace",
    ))
```

#### Step 4: Query Interface
**File**: `backend/agents/graphrag_query.py` (NEW)

```python
from graphrag.query.context_builder.entity_extraction import EntityVectorStoreKey
from graphrag.query.llm.oai.chat_openai import ChatOpenAI
from graphrag.query.question_gen.local_gen import LocalQuestionGen
from graphrag.query.structured_search.local_search.mixed_context import LocalSearchMixedContext
from graphrag.query.structured_search.local_search.search import LocalSearch
from graphrag.query.structured_search.global_search.search import GlobalSearch

class GraphRAGQueryEngine:
    """GraphRAG query engine for legal knowledge"""

    def __init__(self, workspace_dir: str):
        self.workspace_dir = Path(workspace_dir)
        self.llm = ChatOpenAI(
            api_base="http://localhost:11434/v1",
            model="gemma3-legal:latest",
            api_type="openai",
        )

    async def local_search(self, query: str, top_k: int = 5):
        """Entity-focused local search"""
        search_engine = LocalSearch(
            llm=self.llm,
            context_builder=LocalSearchMixedContext(
                entity_text_embeddings=self._get_entity_embeddings(),
                text_unit_prop=0.5,
                community_prop=0.25,
                top_k_relationships=10,
            ),
        )

        result = await search_engine.asearch(query)
        return {
            "query": query,
            "answer": result.response,
            "entities": result.context_data["entities"],
            "relationships": result.context_data["relationships"],
            "sources": result.context_data["sources"],
        }

    async def global_search(self, query: str):
        """Graph-wide global search"""
        search_engine = GlobalSearch(
            llm=self.llm,
            context_builder_params={
                "use_community_summary": True,
                "shuffle_data": False,
                "include_community_rank": True,
            },
        )

        result = await search_engine.asearch(query)
        return {
            "query": query,
            "answer": result.response,
            "communities": result.context_data["reports"],
        }
```

---

## 🔄 Phase 99: Unified Agent Orchestration

### Integration Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   SvelteKit Frontend                            │
│              /api/agent/execute (POST)                          │
└───────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│              Agent Router (Python FastAPI)                      │
│                                                                 │
│   - Analyze request intent                                     │
│   - Select optimal agent framework                             │
│   - Route to: AutoGen | CrewAI | GraphRAG                     │
└───┬──────────────┬──────────────┬────────────────────────────────┘
    │              │              │
    ▼              ▼              ▼
┌────────┐   ┌────────┐   ┌──────────┐
│AutoGen │   │CrewAI  │   │GraphRAG  │
│Multi-  │   │Task    │   │Knowledge │
│Agent   │   │Based   │   │Graph     │
└───┬────┘   └───┬────┘   └────┬─────┘
    │            │             │
    └────────────┴─────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────┐
│              FastMCP Tool Server (Port 3003)                    │
│  RAG | KAG | MinIO | Ollama | Redis | PostgreSQL              │
└────────────────────────────────────────────────────────────────┘
```

**File**: `backend/api/agent_router.py` (NEW)

```python
from fastapi import APIRouter
from enum import Enum
from backend.agents.autogen_legal_team import LegalAgentTeam
from backend.agents.crewai_investigation_team import LegalInvestigationCrew
from backend.agents.graphrag_query import GraphRAGQueryEngine

router = APIRouter(prefix="/api/agent", tags=["Agent Router"])

class AgentFramework(str, Enum):
    AUTOGEN = "autogen"
    CREWAI = "crewai"
    GRAPHRAG = "graphrag"
    AUTO = "auto"  # Automatic selection

def select_framework(task_type: str) -> AgentFramework:
    """Intelligent framework selection"""
    task_patterns = {
        AgentFramework.AUTOGEN: ["collaborate", "discuss", "debate", "consensus"],
        AgentFramework.CREWAI: ["workflow", "sequential", "investigation", "report"],
        AgentFramework.GRAPHRAG: ["knowledge", "research", "precedent", "citation"],
    }

    for framework, keywords in task_patterns.items():
        if any(kw in task_type.lower() for kw in keywords):
            return framework

    return AgentFramework.GRAPHRAG  # Default to knowledge retrieval

@router.post("/execute")
async def execute_agent_task(
    task: str,
    framework: AgentFramework = AgentFramework.AUTO,
    case_id: str = None,
):
    """Route task to optimal agent framework"""
    if framework == AgentFramework.AUTO:
        framework = select_framework(task)

    if framework == AgentFramework.AUTOGEN:
        legal_team = LegalAgentTeam()
        result = await legal_team.analyze_case(case_id, task)

    elif framework == AgentFramework.CREWAI:
        investigation_crew = LegalInvestigationCrew()
        result = investigation_crew.investigate_case(case_id, task)

    elif framework == AgentFramework.GRAPHRAG:
        graphrag = GraphRAGQueryEngine("graphrag_workspace")
        result = await graphrag.global_search(task)

    return {
        "success": True,
        "framework_used": framework.value,
        "task": task,
        "result": result,
    }
```

---

## 📊 Error Fixing & Route Consolidation Strategy

### Current Error State (Phase 90 Summary)

**Total Errors**: 42,518 (down from 87,835 - 51.7% reduction)

**Error Distribution**:
- TypeScript errors: ~35,000 (82%)
- Svelte 5 migration: ~5,000 (12%)
- Import/export: ~2,500 (6%)

**Proven Fix Patterns** (Redis KAG):
1. UnionType → `$state<T>` (95% confidence, 1,203 successful fixes)
2. ForStatement → `{#each}` block (92% confidence, 487 fixes)
3. TypeAliasDeclaration → Interface migration (88% confidence, 312 fixes)
4. ... (11 more patterns with 75-95% confidence)

### Phase 96+ Error Fixing Strategy

#### Approach 1: AutoGen Multi-Agent Debugging
**Use Case**: Complex type errors requiring multi-step reasoning

```python
# AutoGen workflow
legal_team.analyze_error(
    error_id="TS2322",
    file_path="src/lib/components/ui/Button.svelte",
    context={
        "imports": [...],
        "ast_node": {...},
        "previous_fixes": [...],
    }
)

# Agents collaborate:
# 1. Researcher: Find similar errors in PostgreSQL knowledge_base
# 2. Analyst: Identify root cause via Neo4j graph traversal
# 3. Strategist: Generate fix with confidence score
```

**Expected**: 15-20% additional error reduction (6,300-8,500 errors fixed)

---

#### Approach 2: CrewAI Sequential Fixing Pipeline
**Use Case**: Route consolidation and systematic refactoring

```python
# CrewAI workflow
consolidation_crew.execute_workflow(
    tasks=[
        "Analyze duplicate routes",
        "Identify SSR compatibility",
        "Generate consolidated +page.server.ts",
        "Validate with svelte-check",
        "Apply fixes",
    ]
)

# Sequential execution:
# Task 1: Route analyzer scans src/routes/**/*
# Task 2: SSR checker validates server-side safety
# Task 3: Code generator creates consolidated files
# Task 4: Validator runs svelte-check
# Task 5: Applier writes changes to disk
```

**Expected**: 10-15% route reduction (consolidate ~50 routes → ~40 routes)

---

#### Approach 3: GraphRAG Knowledge-Driven Fixes
**Use Case**: Precedent-based error resolution

```python
# GraphRAG workflow
graphrag.local_search(
    query="How to fix TS2322 type mismatch in Svelte 5 $state rune?",
    top_k=10,
)

# Returns:
# - Entity: TS2322 (error code)
# - Relationships: [fixed_by → UnionType pattern, used_in → 1,203 files]
# - Community: TypeScript 5.6 migration cluster
# - Sources: Redis KAG patterns, PostgreSQL successful_patches
```

**Expected**: 25-30% error reduction via proven patterns (10,600-12,750 errors)

---

### Combined Impact Projection

| Strategy | Error Reduction | Estimated Fixes | Timeline |
|----------|-----------------|-----------------|----------|
| **AutoGen Multi-Agent** | 15-20% | 6,300-8,500 | 2-3 weeks |
| **CrewAI Route Consolidation** | 10-15% routes | ~10 routes | 1 week |
| **GraphRAG Pattern Matching** | 25-30% | 10,600-12,750 | 3-4 weeks |
| **Combined Total** | **50-65%** | **16,900-21,250** | **6-8 weeks** |

**Final Error Count**: 21,268 - 25,618 (down from 42,518)

---

## 🛠️ Implementation Roadmap

### Week 1-2: AutoGen Foundation
- [ ] Install AutoGen + dependencies
- [ ] Configure Ollama LLM backend
- [ ] Implement LegalAgentTeam (researcher, analyst, strategist)
- [ ] Convert FastMCP tools to AutoGen function calling format
- [ ] Test multi-agent conversation flow
- [ ] Deploy `/api/autogen/analyze-case` endpoint

### Week 3: CrewAI Workflows
- [ ] Install CrewAI + crewai-tools
- [ ] Implement LegalInvestigationCrew (document analyst, timeline builder, report writer)
- [ ] Create custom tools (RAG search, graph query)
- [ ] Test sequential task execution
- [ ] Deploy `/api/crewai/investigate` endpoint

### Week 4-5: GraphRAG Integration
- [ ] Install GraphRAG
- [ ] Configure for legal domain (entity types, community detection)
- [ ] Index existing knowledge base (PostgreSQL + Neo4j)
- [ ] Implement GraphRAGQueryEngine (local + global search)
- [ ] Test entity extraction + hierarchical clustering
- [ ] Deploy `/api/graphrag/search` endpoint

### Week 6: Agent Router
- [ ] Implement intelligent framework selection
- [ ] Create unified `/api/agent/execute` endpoint
- [ ] Add framework performance metrics
- [ ] Test routing logic with sample tasks
- [ ] Deploy production agent router

### Week 7-8: Error Fixing Campaign
- [ ] Run AutoGen on high-impact TypeScript errors
- [ ] Execute CrewAI route consolidation
- [ ] Apply GraphRAG pattern matching
- [ ] Measure error reduction after each batch
- [ ] Update Redis KAG patterns with new learnings
- [ ] Generate final cumulative report

---

## 📈 Success Metrics

### Technical Metrics
- [ ] Error reduction: 50-65% (target: 21K-26K remaining)
- [ ] Route consolidation: 10-15 routes merged
- [ ] Agent response time: <30 seconds for simple queries, <2 minutes for complex analysis
- [ ] Knowledge base coverage: 95%+ of error patterns indexed
- [ ] Fix accuracy: 85%+ of agent-generated fixes compile successfully

### System Health
- [ ] Ollama GPU utilization: 60-80% during agent execution
- [ ] Qdrant query latency: <100ms for vector search
- [ ] Neo4j graph traversal: <500ms for 3-hop queries
- [ ] PostgreSQL pgvector search: <200ms for HNSW index
- [ ] Redis cache hit rate: >90% for repeated error patterns

### Cost Comparison (vs Cloud)
| Infrastructure | Self-Hosted (Monthly) | Vertex AI (Standard) | Savings |
|----------------|----------------------|----------------------|---------|
| **Compute** | $0 (existing RTX 3060 Ti) | $7,840.80 | $7,840.80 |
| **Storage** | $0 (local disks) | $2,352.24 | $2,352.24 |
| **Sessions** | $0 | $19,440 | $19,440 |
| **Memory** | $0 | $13,608 | $13,608 |
| **Total** | **$0/month** | **$43,241.04/month** | **$43,241.04/month** |

**Annual Cost**:
- **Self-Hosted**: **$0** (only electricity, ~$10-20/month for GPU power)
- **Vertex AI Standard**: **$518,892.48/year**
- **Avoided Cloud Costs**: **$518,892.48/year**

> **Note**: Self-hosted uses existing hardware. Only operational cost is electricity (~$10-20/month for RTX 3060 Ti at full load). No SaaS licensing fees.

---

## 🎯 Next Actions

### Immediate (This Week)
1. **Install AutoGen**:
   ```powershell
   .venv\Scripts\Activate.ps1
   pip install pyautogen[lmm,retrievechat,gemini]
   ```

2. **Test Ollama OpenAI Compatibility**:
   ```python
   import httpx
   response = httpx.post(
       "http://localhost:11434/v1/chat/completions",
       json={
           "model": "gemma3-legal:latest",
           "messages": [{"role": "user", "content": "Hello"}],
       },
   )
   print(response.json())
   ```

3. **Create Agent Stubs → Real Implementation**:
   - Replace `src/lib/services/agent-stubs.ts` with actual AutoGen calls
   - Update TypeScript types for agent responses

### Short-Term (Next 2 Weeks)
- Implement `LegalAgentTeam` with FastMCP tool integration
- Deploy `/api/autogen/analyze-case` endpoint
- Test multi-agent case analysis workflow
- Measure error reduction on 100-error test set

### Long-Term (Next 6-8 Weeks)
- Complete CrewAI + GraphRAG integration
- Deploy unified agent router
- Execute full error fixing campaign
- Achieve <25K total errors (65% reduction from peak)
- Update knowledge base documentation

---

## 📚 References

### AutoGen Documentation
- **GitHub**: https://github.com/microsoft/autogen
- **Docs**: https://microsoft.github.io/autogen/docs/Getting-Started
- **Examples**: https://microsoft.github.io/autogen/docs/Examples

### CrewAI Documentation
- **GitHub**: https://github.com/joaomdmoura/crewai
- **Docs**: https://docs.crewai.com/
- **Tools**: https://docs.crewai.com/core-concepts/Tools/

### GraphRAG Documentation
- **GitHub**: https://github.com/microsoft/graphrag
- **Docs**: https://microsoft.github.io/graphrag/
- **Research Paper**: https://arxiv.org/abs/2404.16130

### LangExtract Documentation
- **GitHub**: https://github.com/microsoft/langextract
- **Docs**: https://microsoft.github.io/langextract/

---

**Status**: ✅ Plan Complete | **Next**: Begin AutoGen implementation (Week 1)

**Last Updated**: January 10, 2026
