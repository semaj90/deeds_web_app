#!/usr/bin/env python3
"""
Agent Context Confirmation Layer

Allows the agent to propose a candidate context from chat history,
ask the user "is this the one you meant?", and wait for explicit feedback.

This prevents the agent from gambling on the wrong part of the history.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)


class ContextConfirmationManager:
    """Manages context candidates and user feedback."""

    def __init__(self, redis_cache, embedding_service):
        """
        Args:
            redis_cache: RedisCache instance
            embedding_service: Service to embed text (Ollama, etc.)
        """
        self.redis = redis_cache
        self.embeddings = embedding_service

    def _now_iso(self) -> str:
        """ISO timestamp."""
        return datetime.now(timezone.utc).isoformat()

    # ============ Chat Event Logging ============

    def log_chat_event(
        self, session_id: str, role: str, content: str, msg_id: Optional[int] = None
    ) -> None:
        """
        Log a chat message as a timeline event.

        Args:
            session_id: Session ID
            role: 'user' or 'assistant'
            content: Message text
            msg_id: Optional message ID for range tracking
        """
        key = f"agent:timeline:{session_id}"
        event = {
            "ts": self._now_iso(),
            "kind": f"chat-{role}",
            "payload": {
                "text": content,
                "msg_id": msg_id,
            },
        }
        self.redis.lpush_json(key, event)
        self.redis.ltrim(key, 0, 499)  # Keep last 500 events

    # ============ Context Candidate Search ============

    def find_chat_context_candidate(
        self, session_id: str, user_query: str, limit: int = 3
    ) -> Tuple[Optional[Dict[str, Any]], float]:
        """
        Search chat history for a candidate context matching the user's query.

        Returns:
            (candidate_dict, confidence_score) or (None, 0.0) if not found
        """
        try:
            # 1) Embed the query
            query_vec = self.embeddings.embed_text(user_query)

            # 2) Fetch recent chat events from timeline
            key = f"agent:timeline:{session_id}"
            events = self.redis.lrange_json(key, 0, 99) or []  # Last 100 events

            # 3) Filter to chat events only
            chat_events = [
                e for e in events if e.get("kind", "").startswith("chat-")
            ]

            if not chat_events:
                return None, 0.0

            # 4) Embed each chat segment and compute similarity
            best_match = None
            best_score = 0.0

            for i, event in enumerate(chat_events):
                text = event.get("payload", {}).get("text", "")
                if not text:
                    continue

                try:
                    seg_vec = self.embeddings.embed_text(text)
                    # Cosine similarity
                    score = self._cosine_similarity(query_vec, seg_vec)

                    if score > best_score:
                        best_score = score
                        best_match = (event, i)
                except Exception as e:
                    logger.warning(f"Failed to embed segment: {e}")
                    continue

            if not best_match:
                return None, 0.0

            event, idx = best_match
            msg_id = event.get("payload", {}).get("msg_id", idx)

            # 5) Build candidate object
            context_id = str(uuid.uuid4())
            candidate = {
                "context_id": context_id,
                "source": "chatlog",
                "score": float(best_score),
                "snippet": event.get("payload", {}).get("text", "")[:500],  # truncate
                "range": {
                    "from_msg_id": msg_id,
                    "to_msg_id": msg_id,
                },
                "timestamp": event.get("ts"),
            }

            # 6) Cache candidate for later feedback
            cache_key = f"agent:context_candidate:{context_id}"
            self.redis.set_json(
                cache_key,
                {
                    "session_id": session_id,
                    "candidate": candidate,
                    "created_at": self._now_iso(),
                },
                ttl=3600,  # 1 hour
            )

            return candidate, best_score

        except Exception as e:
            logger.error(f"Failed to find context candidate: {e}")
            return None, 0.0

    def _cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0

        dot = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = sum(a * a for a in vec_a) ** 0.5
        norm_b = sum(b * b for b in vec_b) ** 0.5

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot / (norm_a * norm_b)

    # ============ Context Feedback ============

    def record_context_feedback(
        self,
        session_id: str,
        context_id: str,
        accepted: bool,
        user_comment: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Record user feedback on a proposed context.

        Args:
            session_id: Session ID
            context_id: Context candidate ID
            accepted: True if user accepted, False if rejected
            user_comment: Optional user comment

        Returns:
            Feedback response dict
        """
        # 1) Fetch the candidate
        cache_key = f"agent:context_candidate:{context_id}"
        data = self.redis.get_json(cache_key)

        if not data:
            return {
                "status": "error",
                "message": "Context candidate not found",
            }

        candidate = data.get("candidate", {})

        # 2) Record feedback to timeline
        if accepted:
            self.redis.lpush_json(
                f"agent:timeline:{session_id}",
                {
                    "ts": self._now_iso(),
                    "kind": "agent-context-accepted",
                    "payload": {
                        "context_id": context_id,
                        "candidate": candidate,
                        "user_comment": user_comment,
                    },
                },
            )
            status = "accepted"
            hint = "Context locked in; agent will continue from this point."
        else:
            self.redis.lpush_json(
                f"agent:timeline:{session_id}",
                {
                    "ts": self._now_iso(),
                    "kind": "agent-context-rejected",
                    "payload": {
                        "context_id": context_id,
                        "candidate": candidate,
                        "user_comment": user_comment,
                    },
                },
            )
            status = "rejected"
            hint = "Agent will search for a different context."

        # 3) Clean up candidate cache
        self.redis.delete(cache_key)

        return {
            "status": status,
            "next_hint": hint,
            "context_id": context_id,
        }

    # ============ Context Retrieval ============

    def get_context_by_id(self, context_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a cached context candidate by ID."""
        cache_key = f"agent:context_candidate:{context_id}"
        data = self.redis.get_json(cache_key)
        return data.get("candidate") if data else None

    def get_chat_range(
        self, session_id: str, from_msg_id: int, to_msg_id: int
    ) -> str:
        """
        Retrieve chat messages in a range.

        Returns:
            Formatted chat snippet
        """
        key = f"agent:timeline:{session_id}"
        events = self.redis.lrange_json(key, 0, -1) or []

        # Filter to chat events in range
        chat_events = [
            e
            for e in events
            if e.get("kind", "").startswith("chat-")
            and from_msg_id <= e.get("payload", {}).get("msg_id", 0) <= to_msg_id
        ]

        lines = []
        for e in reversed(chat_events):  # oldest first
            role = e.get("kind", "").replace("chat-", "")
            text = e.get("payload", {}).get("text", "")
            lines.append(f"[{role}] {text}")

        return "\n".join(lines)
