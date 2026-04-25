#!/usr/bin/env python3
"""
Agentic ACE Loop - Timeline, mini-graph, "what's next?" planner
Integrated with Agentic Context Anchor (ACA) for context overflow handling.
"""
from __future__ import annotations
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid

from backend.services.redis_cache import RedisCache
from backend.services.granite_client import GraniteClient
from backend.services.alignment_router import AlignmentRouter
from backend.services.agent_context import AgentContextAnchor

class AgentPlanner:
    def __init__(self, redis_url: str, granite_config: Dict[str, Any], neo4j_config: Dict[str, Any]):
        self.redis = RedisCache(redis_url)
        self.granite = GraniteClient(**granite_config)
        self.align = AlignmentRouter(
            redis_cache=self.redis,
            neo4j_uri=neo4j_config['uri'],
            neo4j_user=neo4j_config['user'],
            neo4j_password=neo4j_config['password'],
            granite_client=self.granite,
        )
        # Initialize ACA for context management
        self.aca = AgentContextAnchor(self.redis, self.granite)

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def record_event(self, session_id: str, kind: str, payload: Dict[str, Any], description: str = "") -> None:
        """Record a timeline event"""
        key = f"agent:events:{session_id}"
        event = {
            "id": str(uuid.uuid4()),
            "ts": self._now(),
            "kind": kind,
            "payload": payload,
            "description": description
        }
        self.redis.lpush_json(key, event)
        self.redis.ltrim(key, 0, 199)  # Keep last 200 events

        # Update session metadata
        self._update_session_meta(session_id, kind, description)

    def get_events(self, session_id: str) -> List[Dict[str, Any]]:
        """Get timeline events"""
        key = f"agent:events:{session_id}"
        events = self.redis.lrange_json(key, 0, -1) or []
        return list(reversed(events))  # Most recent first

    def _update_session_meta(self, session_id: str, last_kind: str, last_desc: str):
        """Update session metadata"""
        key = f"agent:session:{session_id}"
        meta = self.redis.get_json(key) or {
            "session_id": session_id,
            "created_at": self._now(),
            "last_step": "",
            "goal": "",
            "summary": ""
        }
        meta.update({
            "updated_at": self._now(),
            "last_step": last_kind,
            "last_description": last_desc
        })
        self.redis.set_json(key, meta)

    def summarize_session(self, session_id: str) -> str:
        """Generate AI summary of session progress"""
        events = self.get_events(session_id)
        if not events:
            return "No events recorded yet."

        # Get recent events (last 50)
        recent = events[-50:]
        text = "\n".join([
            f"[{e['ts']}] {e['kind']}: {e.get('description', str(e.get('payload', {})))}"
            for e in recent
        ])

        prompt = f"""Summarize this legal AI agent session timeline.
Focus on: current progress, key findings, next logical steps, and completion status.

Timeline:
{text}

Summary:"""

        return self.granite.generate(prompt, max_tokens=300)

    def next_step(self, session_id: str, user_message: Optional[str] = None) -> Dict[str, Any]:
        """
        Agentic planner: analyze events + alignment signals → suggest next action
        """
        events = self.get_events(session_id)
        if not events:
            return {
                "action": "ask_goal",
                "reason": "No events yet - need to understand the goal",
                "confidence": 1.0
            }

        # Get session metadata
        meta_key = f"agent:session:{session_id}"
        meta = self.redis.get_json(meta_key) or {}

        # Analyze event patterns
        event_counts = {}
        for e in events:
            event_counts[e['kind']] = event_counts.get(e['kind'], 0) + 1

        last_event = events[0]  # Most recent

        # Simple heuristic-based planning (can be replaced with LLM)
        if last_event['kind'] == 'ingest':
            return {
                "action": "search",
                "reason": "New case ingested - should search for relevant legal precedents",
                "confidence": 0.9
            }

        if event_counts.get('search', 0) > 3 and event_counts.get('summary', 0) == 0:
            return {
                "action": "summary",
                "reason": "Multiple searches completed - ready to summarize findings",
                "confidence": 0.8
            }

        if event_counts.get('search', 0) > 0 and event_counts.get('citation_analysis', 0) == 0:
            return {
                "action": "analyze_citations",
                "reason": "Search results available - should analyze citation strength",
                "confidence": 0.7
            }

        if user_message and 'timeline' in user_message.lower():
            return {
                "action": "show_timeline",
                "reason": "User requested timeline view",
                "confidence": 1.0
            }

        # Check alignment signals
        alignment = self.align.get_alignment_signals(session_id)
        if alignment.get('needs_research', False):
            return {
                "action": "search",
                "reason": "Alignment analysis indicates need for additional research",
                "confidence": 0.6
            }

        # Default: ask user
        return {
            "action": "ask_user",
            "reason": "Current state analyzed - awaiting user direction",
            "confidence": 0.5
        }

    def get_mini_graph(self, session_id: str) -> Dict[str, Any]:
        """Generate mini knowledge graph for current session"""
        events = self.get_events(session_id)

        # Extract entities and relationships from events
        nodes = []
        edges = []

        case_id = session_id.split(':')[0] if ':' in session_id else session_id

        # Add case node
        nodes.append({
            "id": f"case_{case_id}",
            "type": "case",
            "label": f"Case {case_id}"
        })

        # Process events into graph
        for event in events[-20:]:  # Last 20 events
            event_id = f"event_{event['id']}"
            nodes.append({
                "id": event_id,
                "type": "event",
                "label": event['kind'],
                "timestamp": event['ts']
            })

            edges.append({
                "from": f"case_{case_id}",
                "to": event_id,
                "type": "timeline"
            })

            # Add payload entities
            payload = event.get('payload', {})
            if 'query' in payload:
                query_id = f"query_{hash(payload['query'])}"
                nodes.append({
                    "id": query_id,
                    "type": "query",
                    "label": payload['query'][:50]
                })
                edges.append({
                    "from": event_id,
                    "to": query_id,
                    "type": "searches"
                })

        return {
            "nodes": nodes,
            "edges": edges,
            "summary": f"Session graph with {len(nodes)} nodes, {len(edges)} relationships"
        }

    # ============ ACA Integration ============

    def init_session_with_plan(
        self, session_id: str, goal: str, spec_files: List[str]
    ) -> None:
        """Initialize a session with a plan and ACA."""
        self.aca.set_plan(session_id, goal, spec_files)
        self.record_event(session_id, "session_init", {"goal": goal}, f"Session initialized: {goal}")

    def get_aca_context(self, session_id: str, goal: str) -> Dict[str, Any]:
        """Get ACA context (plan + summaries + latent marker)."""
        return self.aca.ensure_summaries(session_id, goal)

    def build_llm_prompt_with_aca(
        self, session_id: str, goal: str, user_message: str
    ) -> tuple:
        """Build LLM prompt with ACA context."""
        return self.aca.build_llm_prompt(session_id, goal, user_message)

    def check_context_overflow(
        self, session_id: str, goal: str, token_limit: int = 8192
    ) -> bool:
        """Check and handle context overflow."""
        return self.aca.maybe_compact_context(session_id, goal, token_limit)

    def recover_context_from_marker(self, marker: str) -> Dict[str, Any]:
        """Recover context from a latent marker."""
        return self.aca.recover_context(marker)