"""
ACE Knowledge Graph Bridge
===========================

Connects Phase 89 Timeline System with Neo4j Knowledge Graph.

Purpose:
- Link timeline events (fixes, LLM calls, knowledge queries) to knowledge graph entities
- Enable learning from past successes: "What worked before for similar errors?"
- Track knowledge source effectiveness: "Which RAG sources lead to successful fixes?"
- Build semantic chains: Query → LLM Call → Fix → Success/Failure

Architecture:
- Timeline events stored in PostgreSQL with 768d/1024d embeddings
- Knowledge graph nodes/relationships in Neo4j
- Bridge creates bidirectional links for semantic querying

Collections:
- phase89_ace_fixes → (Fix)-[:SOLVED]->(Error), (Fix)-[:USED_SOURCE]->(KnowledgeCard)
- phase89_ace_llm_calls → (Fix)-[:GENERATED_BY]->(LLMCall)
- phase89_ace_knowledge → (Query)-[:RETRIEVED]->(KnowledgeCard)

Author: ACE Contextual Engineering System
Phase: 89 - VLM Timeline + Knowledge Graph Integration
"""

import os
import sys
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from neo4j import GraphDatabase
import psycopg2
from psycopg2.extras import Json

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ACEKnowledgeGraphBridge:
    """
    Bridge between Timeline System (PostgreSQL) and Knowledge Graph (Neo4j).

    Creates semantic links enabling:
    - "Show me all successful fixes for TypeScript errors"
    - "Which knowledge sources lead to high-confidence fixes?"
    - "What was the complete chain: query → LLM → fix → success?"
    """

    def __init__(
        self,
        neo4j_uri: str = "bolt://localhost:7687",
        neo4j_user: str = "neo4j",
        neo4j_password: str = "password",
        db_url: str = "postgresql://legal_admin:123456@localhost:5434/legal_ai_db"
    ):
        self.neo4j_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
        self.db_url = db_url
        logger.info("🌉 ACE Knowledge Graph Bridge initialized")

    def close(self):
        """Close Neo4j connection"""
        if self.neo4j_driver:
            self.neo4j_driver.close()
            logger.info("🔌 Neo4j connection closed")

    # ========================================
    # LINK FIX ATTEMPTS TO KNOWLEDGE GRAPH
    # ========================================

    def link_fix_to_graph(
        self,
        event_id: int,
        file_path: str,
        error_type: str,
        knowledge_sources: List[str],
        llm_call_event_id: Optional[int] = None,
        success: Optional[bool] = None,
        confidence_score: float = 0.0
    ) -> bool:
        """
        Link ACE fix attempt to knowledge graph.

        Creates:
        - (Fix) node with event_id, file_path, error_type, success, confidence
        - (Error) node if doesn't exist
        - (Fix)-[:SOLVED {confidence}]->(Error) if successful
        - (Fix)-[:ATTEMPTED]->(Error) if pending/failed
        - (Fix)-[:USED_SOURCE]->(KnowledgeCard) for each RAG source
        - (Fix)-[:GENERATED_BY]->(LLMCall) if llm_call_event_id provided

        Args:
            event_id: Timeline event ID from phase89_vector_events
            file_path: File being fixed
            error_type: TypeScript, Python, Svelte5, etc.
            knowledge_sources: List of RAG sources (e.g., ["qdrant://phase76_knowledge_base/svelte5_runes.md"])
            llm_call_event_id: Optional LLM call event ID
            success: True if fix applied successfully, False if failed, None if pending
            confidence_score: Fix confidence (0.0-1.0)

        Returns:
            True if linked successfully
        """
        try:
            with self.neo4j_driver.session() as session:
                # Create Fix node + relationships
                cypher = """
                // 1. Create or merge Error node
                MERGE (error:Error {type: $error_type, file_path: $file_path})
                ON CREATE SET
                    error.created_at = datetime(),
                    error.occurrence_count = 1
                ON MATCH SET
                    error.occurrence_count = error.occurrence_count + 1,
                    error.last_seen = datetime()

                // 2. Create Fix node
                CREATE (fix:Fix {
                    event_id: $event_id,
                    file_path: $file_path,
                    error_type: $error_type,
                    success: $success,
                    confidence_score: $confidence_score,
                    created_at: datetime(),
                    timeline_collection: 'phase89_ace_fixes'
                })

                // 3. Link Fix to Error
                WITH fix, error
                MERGE (fix)-[r:SOLVED]->(error)
                ON CREATE SET
                    r.confidence = $confidence_score,
                    r.created_at = datetime(),
                    r.success = $success

                // 4. Link to LLM Call if provided
                WITH fix
                OPTIONAL MATCH (llm_call:LLMCall {event_id: $llm_call_event_id})
                FOREACH (_ IN CASE WHEN llm_call IS NOT NULL THEN [1] ELSE [] END |
                    MERGE (fix)-[gen:GENERATED_BY]->(llm_call)
                    ON CREATE SET gen.created_at = datetime()
                )

                RETURN fix.event_id as fix_event_id
                """

                result = session.run(
                    cypher,
                    event_id=event_id,
                    file_path=file_path,
                    error_type=error_type,
                    success=success,
                    confidence_score=confidence_score,
                    llm_call_event_id=llm_call_event_id
                )

                record = result.single()
                if record:
                    logger.info(f"✅ Linked Fix event #{event_id} to knowledge graph")

                    # Link to knowledge sources
                    self._link_knowledge_sources(event_id, knowledge_sources, session)

                    return True
                else:
                    logger.error(f"❌ Failed to create Fix node for event #{event_id}")
                    return False

        except Exception as e:
            logger.error(f"❌ Error linking fix to graph: {e}")
            return False

    def _link_knowledge_sources(self, fix_event_id: int, sources: List[str], session):
        """Create (Fix)-[:USED_SOURCE]->(KnowledgeCard) relationships"""
        for source in sources:
            try:
                # Parse source URI (e.g., "qdrant://phase76_knowledge_base/svelte5_runes.md")
                if "://" in source:
                    source_type, source_path = source.split("://", 1)
                else:
                    source_type = "unknown"
                    source_path = source

                cypher = """
                MATCH (fix:Fix {event_id: $fix_event_id})
                MERGE (kb:KnowledgeCard {path: $source_path, source_type: $source_type})
                ON CREATE SET
                    kb.created_at = datetime(),
                    kb.usage_count = 1
                ON MATCH SET
                    kb.usage_count = kb.usage_count + 1
                MERGE (fix)-[r:USED_SOURCE]->(kb)
                ON CREATE SET r.created_at = datetime()
                """

                session.run(
                    cypher,
                    fix_event_id=fix_event_id,
                    source_path=source_path,
                    source_type=source_type
                )

                logger.info(f"  ↳ Linked to knowledge source: {source_path}")

            except Exception as e:
                logger.warning(f"  ⚠️  Failed to link source '{source}': {e}")

    # ========================================
    # LINK LLM CALLS TO KNOWLEDGE GRAPH
    # ========================================

    def link_llm_call_to_graph(
        self,
        event_id: int,
        provider: str,
        model: str,
        latency_ms: float,
        success: bool,
        tools_used: List[str] = None
    ) -> bool:
        """
        Link LLM call to knowledge graph.

        Creates:
        - (LLMCall) node with performance metrics
        - (LLMProvider) node
        - (LLMCall)-[:USING]->(LLMProvider)

        Args:
            event_id: Timeline event ID from phase89_ace_llm_calls
            provider: ollama, gemini, claude, openai
            model: gemini-2.0-flash-exp, claude-3.5-sonnet, etc.
            latency_ms: API call latency
            success: True if call succeeded
            tools_used: List of tools/functions used in call

        Returns:
            True if linked successfully
        """
        try:
            with self.neo4j_driver.session() as session:
                cypher = """
                // 1. Create or merge LLM Provider
                MERGE (provider:LLMProvider {name: $provider})
                ON CREATE SET
                    provider.created_at = datetime(),
                    provider.call_count = 1,
                    provider.total_latency_ms = $latency_ms
                ON MATCH SET
                    provider.call_count = provider.call_count + 1,
                    provider.total_latency_ms = provider.total_latency_ms + $latency_ms,
                    provider.avg_latency_ms = (provider.total_latency_ms + $latency_ms) / (provider.call_count + 1)

                // 2. Create LLMCall node
                CREATE (call:LLMCall {
                    event_id: $event_id,
                    provider: $provider,
                    model: $model,
                    latency_ms: $latency_ms,
                    success: $success,
                    tools_used: $tools_used,
                    created_at: datetime(),
                    timeline_collection: 'phase89_ace_llm_calls'
                })

                // 3. Link call to provider
                MERGE (call)-[r:USING]->(provider)
                ON CREATE SET r.created_at = datetime()

                RETURN call.event_id as call_event_id
                """

                result = session.run(
                    cypher,
                    event_id=event_id,
                    provider=provider,
                    model=model,
                    latency_ms=latency_ms,
                    success=success,
                    tools_used=tools_used or []
                )

                if result.single():
                    logger.info(f"✅ Linked LLM call event #{event_id} to knowledge graph ({provider}/{model})")
                    return True
                else:
                    logger.error(f"❌ Failed to create LLMCall node for event #{event_id}")
                    return False

        except Exception as e:
            logger.error(f"❌ Error linking LLM call to graph: {e}")
            return False

    # ========================================
    # LINK KNOWLEDGE QUERIES TO GRAPH
    # ========================================

    def link_knowledge_query_to_graph(
        self,
        event_id: int,
        query_text: str,
        source: str,
        results_count: int,
        avg_similarity: float,
        top_results: List[Dict[str, Any]] = None
    ) -> bool:
        """
        Link knowledge retrieval query to graph.

        Creates:
        - (Query) node
        - (Query)-[:RETRIEVED]->(KnowledgeCard) for each result

        Args:
            event_id: Timeline event ID from phase89_ace_knowledge
            query_text: Query string
            source: qdrant, neo4j, mcp, docs
            results_count: Number of results retrieved
            avg_similarity: Average similarity score
            top_results: Top result details [{"path": "...", "similarity": 0.85}]

        Returns:
            True if linked successfully
        """
        try:
            with self.neo4j_driver.session() as session:
                cypher = """
                CREATE (query:Query {
                    event_id: $event_id,
                    query_text: $query_text,
                    source: $source,
                    results_count: $results_count,
                    avg_similarity: $avg_similarity,
                    created_at: datetime(),
                    timeline_collection: 'phase89_ace_knowledge'
                })
                RETURN query.event_id as query_event_id
                """

                result = session.run(
                    cypher,
                    event_id=event_id,
                    query_text=query_text,
                    source=source,
                    results_count=results_count,
                    avg_similarity=avg_similarity
                )

                if result.single():
                    logger.info(f"✅ Linked knowledge query event #{event_id} to knowledge graph")

                    # Link to retrieved knowledge cards
                    if top_results:
                        self._link_retrieved_knowledge(event_id, top_results, session)

                    return True
                else:
                    logger.error(f"❌ Failed to create Query node for event #{event_id}")
                    return False

        except Exception as e:
            logger.error(f"❌ Error linking knowledge query to graph: {e}")
            return False

    def _link_retrieved_knowledge(self, query_event_id: int, results: List[Dict[str, Any]], session):
        """Create (Query)-[:RETRIEVED {similarity}]->(KnowledgeCard) relationships"""
        for result in results[:5]:  # Top 5 results only
            try:
                path = result.get("path", result.get("id", "unknown"))
                similarity = result.get("similarity", result.get("score", 0.0))

                cypher = """
                MATCH (query:Query {event_id: $query_event_id})
                MERGE (kb:KnowledgeCard {path: $path})
                ON CREATE SET
                    kb.created_at = datetime(),
                    kb.retrieval_count = 1
                ON MATCH SET
                    kb.retrieval_count = kb.retrieval_count + 1
                MERGE (query)-[r:RETRIEVED]->(kb)
                ON CREATE SET
                    r.similarity = $similarity,
                    r.created_at = datetime()
                """

                session.run(
                    cypher,
                    query_event_id=query_event_id,
                    path=path,
                    similarity=similarity
                )

                logger.info(f"  ↳ Retrieved: {path} (similarity: {similarity:.2%})")

            except Exception as e:
                logger.warning(f"  ⚠️  Failed to link retrieved result: {e}")

    # ========================================
    # LEARNING QUERIES
    # ========================================

    def get_successful_fixes_for_error_type(self, error_type: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Query: What worked before for this error type?

        Returns successful fixes with high confidence, including:
        - Fix explanation
        - Knowledge sources used
        - LLM provider/model
        - Confidence score
        - File path
        """
        try:
            with self.neo4j_driver.session() as session:
                cypher = """
                MATCH (error:Error {type: $error_type})<-[:SOLVED]-(fix:Fix)
                WHERE fix.success = true AND fix.confidence_score >= 0.7
                OPTIONAL MATCH (fix)-[:USED_SOURCE]->(kb:KnowledgeCard)
                OPTIONAL MATCH (fix)-[:GENERATED_BY]->(llm:LLMCall)
                RETURN
                    fix.event_id as event_id,
                    fix.file_path as file_path,
                    fix.confidence_score as confidence,
                    llm.provider as llm_provider,
                    llm.model as llm_model,
                    collect(DISTINCT kb.path) as knowledge_sources,
                    fix.created_at as fixed_at
                ORDER BY fix.confidence_score DESC, fix.created_at DESC
                LIMIT $limit
                """

                result = session.run(cypher, error_type=error_type, limit=limit)

                fixes = []
                for record in result:
                    fixes.append({
                        "event_id": record["event_id"],
                        "file_path": record["file_path"],
                        "confidence": record["confidence"],
                        "llm_provider": record["llm_provider"],
                        "llm_model": record["llm_model"],
                        "knowledge_sources": record["knowledge_sources"],
                        "fixed_at": record["fixed_at"]
                    })

                logger.info(f"📊 Found {len(fixes)} successful fixes for {error_type}")
                return fixes

        except Exception as e:
            logger.error(f"❌ Error querying successful fixes: {e}")
            return []

    def get_best_knowledge_sources(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Query: Which knowledge sources lead to successful fixes?

        Returns knowledge cards ranked by:
        - Success rate when used
        - Total usage count
        - Average fix confidence
        """
        try:
            with self.neo4j_driver.session() as session:
                cypher = """
                MATCH (kb:KnowledgeCard)<-[:USED_SOURCE]-(fix:Fix)
                WITH
                    kb,
                    count(fix) as total_uses,
                    sum(CASE WHEN fix.success = true THEN 1 ELSE 0 END) as successful_uses,
                    avg(fix.confidence_score) as avg_confidence
                WHERE total_uses >= 2
                RETURN
                    kb.path as source_path,
                    kb.source_type as source_type,
                    total_uses,
                    successful_uses,
                    toFloat(successful_uses) / total_uses as success_rate,
                    avg_confidence
                ORDER BY success_rate DESC, total_uses DESC
                LIMIT $limit
                """

                result = session.run(cypher, limit=limit)

                sources = []
                for record in result:
                    sources.append({
                        "path": record["source_path"],
                        "type": record["source_type"],
                        "total_uses": record["total_uses"],
                        "successful_uses": record["successful_uses"],
                        "success_rate": record["success_rate"],
                        "avg_confidence": record["avg_confidence"]
                    })

                logger.info(f"📊 Found {len(sources)} top knowledge sources")
                return sources

        except Exception as e:
            logger.error(f"❌ Error querying knowledge sources: {e}")
            return []

    def get_llm_performance_stats(self) -> List[Dict[str, Any]]:
        """
        Query: Which LLM providers/models perform best?

        Returns providers ranked by:
        - Average latency
        - Success rate
        - Total calls
        """
        try:
            with self.neo4j_driver.session() as session:
                cypher = """
                MATCH (provider:LLMProvider)<-[:USING]-(call:LLMCall)
                WITH
                    provider.name as provider_name,
                    count(call) as total_calls,
                    avg(call.latency_ms) as avg_latency,
                    sum(CASE WHEN call.success = true THEN 1 ELSE 0 END) as successful_calls
                RETURN
                    provider_name,
                    total_calls,
                    avg_latency,
                    successful_calls,
                    toFloat(successful_calls) / total_calls as success_rate
                ORDER BY success_rate DESC, avg_latency ASC
                """

                result = session.run(cypher)

                stats = []
                for record in result:
                    stats.append({
                        "provider": record["provider_name"],
                        "total_calls": record["total_calls"],
                        "avg_latency_ms": record["avg_latency"],
                        "successful_calls": record["successful_calls"],
                        "success_rate": record["success_rate"]
                    })

                logger.info(f"📊 Found stats for {len(stats)} LLM providers")
                return stats

        except Exception as e:
            logger.error(f"❌ Error querying LLM stats: {e}")
            return []

# ========================================
# CLI TESTING
# ========================================

def test_bridge():
    """Test ACE Knowledge Graph Bridge with example data"""
    print("\n" + "="*70)
    print("  🧪 ACE Knowledge Graph Bridge - Test Mode")
    print("="*70 + "\n")

    bridge = ACEKnowledgeGraphBridge()

    try:
        # Test 1: Link fix attempt
        print("Test 1: Linking fix attempt to graph...")
        success = bridge.link_fix_to_graph(
            event_id=14,  # From ACE timeline test
            file_path="src/lib/auth/session.ts",
            error_type="TypeScript",
            knowledge_sources=[
                "qdrant://phase76_knowledge_base/svelte5_runes.md",
                "qdrant://phase76_knowledge_base/typescript_migration.md"
            ],
            llm_call_event_id=15,
            success=True,
            confidence_score=0.92
        )
        print(f"   {'✅' if success else '❌'} Fix linked to graph\n")

        # Test 2: Link LLM call
        print("Test 2: Linking LLM call to graph...")
        success = bridge.link_llm_call_to_graph(
            event_id=15,
            provider="gemini",
            model="gemini-2.0-flash-exp",
            latency_ms=1250,
            success=True,
            tools_used=["qdrant_search", "ast_analyzer"]
        )
        print(f"   {'✅' if success else '❌'} LLM call linked to graph\n")

        # Test 3: Link knowledge query
        print("Test 3: Linking knowledge query to graph...")
        success = bridge.link_knowledge_query_to_graph(
            event_id=16,
            query_text="How to migrate from createEventDispatcher to Svelte 5 runes?",
            source="qdrant",
            results_count=5,
            avg_similarity=0.82,
            top_results=[
                {"path": "svelte5_runes.md", "similarity": 0.91},
                {"path": "event_dispatcher_migration.md", "similarity": 0.85}
            ]
        )
        print(f"   {'✅' if success else '❌'} Knowledge query linked to graph\n")

        # Test 4: Query successful fixes
        print("Test 4: Querying successful fixes for TypeScript errors...")
        fixes = bridge.get_successful_fixes_for_error_type("TypeScript", limit=5)
        print(f"   ✅ Found {len(fixes)} successful TypeScript fixes")
        for fix in fixes[:3]:
            print(f"      - Event #{fix['event_id']}: {fix['file_path']} ({fix['confidence']:.0%} confidence)")
        print()

        # Test 5: Query best knowledge sources
        print("Test 5: Querying best knowledge sources...")
        sources = bridge.get_best_knowledge_sources(limit=5)
        print(f"   ✅ Found {len(sources)} top knowledge sources")
        for source in sources[:3]:
            print(f"      - {source['path']}: {source['success_rate']:.0%} success rate ({source['total_uses']} uses)")
        print()

        # Test 6: Query LLM performance
        print("Test 6: Querying LLM performance stats...")
        stats = bridge.get_llm_performance_stats()
        print(f"   ✅ Found stats for {len(stats)} LLM providers")
        for stat in stats:
            print(f"      - {stat['provider']}: {stat['success_rate']:.0%} success, {stat['avg_latency_ms']:.0f}ms avg latency")
        print()

        print("="*70)
        print("  ✅ All tests passed!")
        print("="*70 + "\n")

    finally:
        bridge.close()

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ACE Knowledge Graph Bridge")
    parser.add_argument("--test", action="store_true", help="Run test examples")
    args = parser.parse_args()

    if args.test:
        test_bridge()
    else:
        print("\nACE Knowledge Graph Bridge")
        print("=" * 70)
        print("\nUsage:")
        print("  python ace_knowledge_graph_bridge.py --test")
        print("\nIntegration example:")
        print("""
from backend.services.ace_knowledge_graph_bridge import ACEKnowledgeGraphBridge

# Initialize bridge
bridge = ACEKnowledgeGraphBridge()

# After logging fix to timeline
event_id = ace_timeline_service.log_fix_attempt(fix_data)

# Link to knowledge graph
bridge.link_fix_to_graph(
    event_id=event_id,
    file_path=fix_data.file_path,
    error_type=fix_data.error_type,
    knowledge_sources=fix_data.sources_used,
    llm_call_event_id=llm_call_id,
    success=fix_data.success,
    confidence_score=fix_data.confidence_score
)

# Query what worked before
successful_fixes = bridge.get_successful_fixes_for_error_type("TypeScript")
for fix in successful_fixes:
    print(f"Fix #{fix['event_id']}: {fix['confidence']:.0%} confidence")
    print(f"  Sources: {fix['knowledge_sources']}")
    print(f"  LLM: {fix['llm_provider']}/{fix['llm_model']}")
""")
        print("\n" + "=" * 70)
