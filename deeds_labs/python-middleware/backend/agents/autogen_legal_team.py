"""
AutoGen Legal Agent Team
=========================
Multi-agent system for legal case analysis using AutoGen framework.

Agents:
- Legal Researcher: Search case law and precedents
- Evidence Analyst: Evaluate evidence admissibility
- Case Strategist: Synthesize findings into strategy
- Error Fixer: Autonomous code error correction

All agents use gemma3-legal:latest via Ollama.
"""

import asyncio
import json
from typing import Dict, List, Any, Optional
from pathlib import Path

import autogen
from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager
import httpx

from backend.config.autogen_llm_config import (
    get_autogen_config,
    get_tool_execution_config,
    FASTMCP_TOOLS,
)

# Go Microservices URLs
KNOWLEDGE_PLANE_URL = "http://localhost:8765"  # Phase 87 Knowledge Plane (RAG+KAG hybrid)
LEGAL_ENGINE_URL = "http://localhost:8001"      # Legal-specific processing
RAG_SERVICE_URL = "http://localhost:8095"       # Document chunking/embedding
FASTMCP_URL = "http://localhost:3003"           # Fallback for non-Go tools


class LegalAgentTeam:
    """AutoGen multi-agent team for legal case analysis"""

    def __init__(self):
        config = get_autogen_config()
        tool_config = get_tool_execution_config()

        # Create workspace directory
        Path(tool_config["work_dir"]).mkdir(parents=True, exist_ok=True)

        # 1. Legal Researcher Agent
        self.researcher = AssistantAgent(
            name="legal_researcher",
            llm_config=config,
            system_message="""You are a legal research specialist with expertise in case law, statutes, and legal precedents.

Your role:
- Search legal knowledge base using rag_vector_search
- Find relevant case law and statutory authority
- Cite sources with precision (case name, citation, year)
- Identify binding vs persuasive authority

When asked to research:
1. Use rag_vector_search to find relevant documents
2. Use neo4j_graph_query to trace citation relationships
3. Summarize findings with proper legal citations
4. Distinguish between primary and secondary sources

Format citations as: [Case Name, Citation Year] or [Statute § Section]""",
        )

        # 2. Evidence Analyst Agent
        self.analyst = AssistantAgent(
            name="evidence_analyst",
            llm_config=config,
            system_message="""You are an evidence analysis expert specializing in admissibility and evidentiary standards.

Your role:
- Evaluate evidence admissibility under Federal Rules of Evidence (FRE)
- Analyze chain of custody and authenticity
- Use get_case_evidence_metadata to retrieve evidence details
- Use neo4j_graph_query to trace evidence relationships

When analyzing evidence:
1. Get all evidence metadata for the case
2. Check relevance (FRE 401), unfair prejudice (FRE 403)
3. Verify authentication requirements (FRE 901-903)
4. Assess hearsay exceptions (FRE 801-807)
5. Evaluate privilege claims (FRE 501-502)

Provide admissibility ruling: ADMISSIBLE / INADMISSIBLE / CONDITIONAL""",
        )

        # 3. Case Strategist Agent
        self.strategist = AssistantAgent(
            name="case_strategist",
            llm_config=config,
            system_message="""You are a legal strategy coordinator with expertise in case planning and litigation strategy.

Your role:
- Synthesize research and evidence analysis
- Develop case theories and narratives
- Identify strengths, weaknesses, opportunities, threats (SWOT)
- Generate actionable recommendations

When developing strategy:
1. Review researcher's findings (legal authority)
2. Review analyst's findings (evidence strength)
3. Identify winning arguments and themes
4. Anticipate counterarguments
5. Recommend next steps (discovery, motions, settlement)

Output format:
## Case Strategy Brief
### Legal Foundation: [key authorities]
### Evidence Assessment: [strengths/weaknesses]
### Recommended Approach: [strategy]
### Next Steps: [actionable items]""",
        )

        # 4. Human Proxy (optional approval gate)
        self.human_proxy = UserProxyAgent(
            name="human_attorney",
            human_input_mode="NEVER",  # Fully autonomous (change to TERMINATE for approval gates)
            max_consecutive_auto_reply=10,
            is_termination_msg=lambda x: x.get("content", "").rstrip().endswith("TERMINATE"),
            code_execution_config=tool_config,
        )

        # Register FastMCP tool functions
        self._register_tools()

    def _register_tools(self):
        """Register FastMCP tools for agent execution"""

        @self.researcher.register_for_execution()
        @self.analyst.register_for_execution()
        @self.strategist.register_for_execution()
        @self.human_proxy.register_for_execution()
        def rag_vector_search(query: str, top_k: int = 5) -> str:
            """Search legal knowledge base using RAG (via Go Knowledge Plane)"""
            try:
                # Call Go Knowledge Plane with RAG mode (concurrent goroutines)
                response = httpx.post(
                    f"{KNOWLEDGE_PLANE_URL}/retrieve",
                    json={
                        "query": query,
                        "k": top_k,
                        "mode": "rag",  # Pure vector search
                        "filters": [],
                    },
                    timeout=30.0,
                )
                result = response.json()
                # Transform Go response to match expected format
                contexts = result.get("contexts", [])
                return json.dumps({
                    "results": [
                        {
                            "text": ctx["text"],
                            "source": ctx["source"],
                            "score": ctx["score"],
                            "metadata": ctx.get("metadata", {}),
                        }
                        for ctx in contexts
                    ],
                    "latency_ms": result.get("latency_ms", 0),
                }, indent=2)
            except Exception as e:
                return f"Error calling rag_vector_search (Go Knowledge Plane): {str(e)}"

        @self.researcher.register_for_execution()
        @self.analyst.register_for_execution()
        @self.strategist.register_for_execution()
        @self.human_proxy.register_for_execution()
        def neo4j_graph_query(cypher: str) -> str:
            """Query Neo4j knowledge graph (via Go Knowledge Plane KAG expansion)"""
            try:
                # Call Go Knowledge Plane with KAG expansion
                # Note: For raw Cypher, we'll use the expand endpoint
                response = httpx.post(
                    f"{KNOWLEDGE_PLANE_URL}/expand",
                    json={
                        "seed_ids": [],  # Extract from Cypher if needed
                        "depth": 3,
                        "edge_types": ["CITES", "RELATES_TO", "DEPENDS_ON"],
                        "k": 10,
                    },
                    timeout=30.0,
                )
                result = response.json()
                return json.dumps(result, indent=2)
            except Exception as e:
                return f"Error calling neo4j_graph_query (Go Knowledge Plane): {str(e)}"

        @self.analyst.register_for_execution()
        @self.human_proxy.register_for_execution()
        def get_case_evidence_metadata(case_id: str) -> str:
            """Get evidence metadata for a case"""
            try:
                response = httpx.post(
                    f"{FASTMCP_URL}/tools/get_case_evidence_metadata",
                    json={"case_id": case_id},
                    timeout=30.0,
                )
                result = response.json()
                return json.dumps(result, indent=2)
            except Exception as e:
                return f"Error calling get_case_evidence_metadata: {str(e)}"

        @self.researcher.register_for_execution()
        @self.human_proxy.register_for_execution()
        def get_document_chunks(doc_id: str, bucket: str = "legal-documents") -> str:
            """Get document chunks from MinIO"""
            try:
                response = httpx.post(
                    f"{FASTMCP_URL}/tools/get_document_chunks",
                    json={"doc_id": doc_id, "bucket": bucket},
                    timeout=30.0,
                )
                result = response.json()
                return json.dumps(result, indent=2)
            except Exception as e:
                return f"Error calling get_document_chunks: {str(e)}"

    async def analyze_case(
        self, case_id: str, query: str, max_rounds: int = 20
    ) -> Dict[str, Any]:
        """
        Run multi-agent case analysis workflow

        Args:
            case_id: Case identifier
            query: Analysis query/task
            max_rounds: Maximum conversation rounds

        Returns:
            Analysis results with agent conversation history
        """
        # Create group chat
        groupchat = GroupChat(
            agents=[self.researcher, self.analyst, self.strategist, self.human_proxy],
            messages=[],
            max_round=max_rounds,
            speaker_selection_method="round_robin",  # Each agent speaks in turn
        )

        manager = GroupChatManager(groupchat=groupchat, llm_config=get_autogen_config())

        # Initial message
        initial_message = f"""Case ID: {case_id}
Task: {query}

Workflow:
1. legal_researcher: Research relevant legal authority
2. evidence_analyst: Analyze evidence strength and admissibility
3. case_strategist: Synthesize findings into actionable strategy

When complete, respond with "TERMINATE" to end the conversation."""

        # Initiate conversation
        await self.human_proxy.a_initiate_chat(
            manager,
            message=initial_message,
        )

        # Extract results
        return {
            "case_id": case_id,
            "query": query,
            "agents_involved": [
                "legal_researcher",
                "evidence_analyst",
                "case_strategist",
            ],
            "conversation": [
                {"sender": msg["name"], "content": msg["content"]}
                for msg in groupchat.messages
            ],
            "final_strategy": groupchat.messages[-1]["content"]
            if groupchat.messages
            else "",
            "rounds": len(groupchat.messages),
        }


class ErrorFixerAgent:
    """Autonomous code error fixing agent using AutoGen"""

    def __init__(self):
        config = get_autogen_config()
        tool_config = get_tool_execution_config()

        # Error Fixer Agent
        self.fixer = AssistantAgent(
            name="error_fixer",
            llm_config=config,
            system_message="""You are an autonomous code error fixing agent specializing in TypeScript and Svelte 5.

Your role:
- Analyze TypeScript/Svelte errors from codebase
- Use redis_kag_pattern_search to find proven fix patterns
- Use postgres_query_knowledge_base to find similar errors
- Generate fixes with high confidence

Error fixing workflow:
1. Search Redis KAG for high-confidence patterns (>75%)
2. Query PostgreSQL knowledge base for similar errors
3. Apply proven fix pattern or generate new fix
4. Validate fix compiles successfully

Output format:
```typescript
// FIXED CODE
[corrected code here]
```

EXPLANATION:
[why this fix works, what pattern was applied]

CONFIDENCE: [0.0-1.0 score]""",
        )

        self.human_proxy = UserProxyAgent(
            name="developer",
            human_input_mode="NEVER",
            max_consecutive_auto_reply=5,
            is_termination_msg=lambda x: "FIXED CODE" in x.get("content", ""),
            code_execution_config=tool_config,
        )

        self._register_error_tools()

    def _register_error_tools(self):
        """Register error fixing tools"""

        @self.fixer.register_for_execution()
        @self.human_proxy.register_for_execution()
        def redis_kag_pattern_search(
            error_type: str, min_confidence: float = 0.75
        ) -> str:
            """Search Redis KAG patterns"""
            try:
                response = httpx.post(
                    f"{FASTMCP_URL}/tools/redis_kag_pattern_search",
                    json={"error_type": error_type, "min_confidence": min_confidence},
                    timeout=30.0,
                )
                result = response.json()
                return json.dumps(result, indent=2)
            except Exception as e:
                return f"Error calling redis_kag_pattern_search: {str(e)}"

        @self.fixer.register_for_execution()
        @self.human_proxy.register_for_execution()
        def postgres_query_knowledge_base(query: str, limit: int = 10) -> str:
            """Query PostgreSQL knowledge base"""
            try:
                response = httpx.post(
                    f"{FASTMCP_URL}/tools/postgres_query_knowledge_base",
                    json={"query": query, "limit": limit},
                    timeout=30.0,
                )
                result = response.json()
                return json.dumps(result, indent=2)
            except Exception as e:
                return f"Error calling postgres_query_knowledge_base: {str(e)}"

    async def fix_error(
        self, error_code: str, file_path: str, error_message: str, context: str
    ) -> Dict[str, Any]:
        """
        Autonomously fix code error

        Args:
            error_code: Error code (e.g., TS2322)
            file_path: File path with error
            error_message: Error message
            context: Code context around error

        Returns:
            Fix with confidence score
        """
        initial_message = f"""Fix this error autonomously:

Error Code: {error_code}
File: {file_path}
Message: {error_message}

Context:
```typescript
{context}
```

Steps:
1. Search Redis KAG patterns for {error_code}
2. Query PostgreSQL for similar errors
3. Generate fix using proven pattern
4. Provide FIXED CODE, EXPLANATION, and CONFIDENCE score"""

        await self.human_proxy.a_initiate_chat(
            self.fixer,
            message=initial_message,
        )

        # Extract fix from conversation
        last_message = self.fixer.last_message()["content"]

        return {
            "error_code": error_code,
            "file_path": file_path,
            "fix": last_message,
            "conversation": [
                {"sender": msg["name"], "content": msg["content"]}
                for msg in [self.human_proxy.last_message(), last_message]
            ],
        }
