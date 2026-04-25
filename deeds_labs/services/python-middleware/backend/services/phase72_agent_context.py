#!/usr/bin/env python3
"""
Phase 72 Agentic Context Anchor (ACA-72)

Specializes ACA for the Neo4j-based AST Error Reduction pipeline.
Tracks: error counts, clusters, patches, git commits, user feedback.

Session ID format: phase72:{repo}:{branch}
  e.g. phase72:deeds-web-app:main

Redis keys (Phase-scoped):
  phase72:plan:{session_id}
  phase72:timeline:{session_id}
  phase72:summary:{session_id}:{version}
  phase72:spec_summary:{session_id}:{version}
  phase72:saved_citations:{session_id}    (ZSET by score)
  phase72:search_citations:{session_id}   (ZSET by score)
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import subprocess
import textwrap
import logging

logger = logging.getLogger(__name__)


class Phase72AgentContext:
    """Phase 72-specific ACA for AST error reduction."""

    def __init__(self, redis_cache, granite_client):
        """
        Args:
            redis_cache: RedisCache instance
            granite_client: GraniteClient instance
        """
        self.redis = redis_cache
        self.granite = granite_client

    def _now_iso(self) -> str:
        """ISO timestamp."""
        return datetime.now(timezone.utc).isoformat()

    # ============ Plan Management ============

    def get_plan(self, session_id: str) -> Dict[str, Any]:
        """Fetch Phase 72 plan from Redis."""
        plan = self.redis.get_json(f"phase72:plan:{session_id}")
        return plan or {}

    def set_plan(
        self,
        session_id: str,
        goal: str,
        spec_files: List[str],
        current_step: str = "",
        ttl: int = 7 * 24 * 3600,
    ) -> None:
        """Create or update Phase 72 plan."""
        plan = {
            "session_id": session_id,
            "goal": goal,
            "current_step": current_step,
            "spec_files": spec_files,
            "summary_version": 0,
            "spec_summary_version": 0,
            "created_at": self._now_iso(),
            "updated_at": self._now_iso(),
        }
        self.redis.set_json(f"phase72:plan:{session_id}", plan, ttl=ttl)
        logger.info(f"Phase 72 plan set for {session_id}: {goal}")

    def update_plan_step(self, session_id: str, current_step: str) -> None:
        """Update current step in Phase 72 plan."""
        plan = self.get_plan(session_id)
        if plan:
            plan["current_step"] = current_step
            plan["updated_at"] = self._now_iso()
            self.redis.set_json(f"phase72:plan:{session_id}", plan)

    # ============ Timeline Management ============

    def append_timeline(
        self,
        session_id: str,
        kind: str,
        payload: Dict[str, Any],
        description: str = "",
    ) -> None:
        """
        Append event to Phase 72 timeline.

        kind examples:
          - 'svelte-check' (error ingestion)
          - 'cluster-formed' (DBSCAN clustering)
          - 'patch-generated' (AI patch generation)
          - 'patch-applied' (patch applied to file)
          - 'git-commit' (changes committed)
          - 'user-feedback' (user reviewed/rejected)
          - 'agent-next-step' (agent decision)
        """
        key = f"phase72:timeline:{session_id}"
        event = {
            "ts": self._now_iso(),
            "kind": kind,
            "payload": payload,
            "description": description,
        }
        self.redis.lpush_json(key, event)
        # Keep last 500 events
        self.redis.ltrim(key, 0, 499)

    def get_timeline_snippet(self, session_id: str, limit: int = 50) -> str:
        """Get text snippet of recent Phase 72 timeline events."""
        key = f"phase72:timeline:{session_id}"
        events = self.redis.lrange_json(key, 0, limit - 1) or []

        lines = []
        for event in reversed(events):  # oldest first
            ts = event.get("ts", "?")
            kind = event.get("kind", "?")
            desc = event.get("description", "")
            payload_str = str(event.get("payload", {}))[:100]
            line = f"[{ts}] {kind}: {desc or payload_str}"
            lines.append(line)

        return "\n".join(lines)

    # ============ Spec Extraction ============

    def _ripgrep_specs(self, paths: List[str], keywords: List[str]) -> str:
        """Extract relevant spec chunks via ripgrep."""
        if not paths or not keywords:
            return ""

        pattern = "|".join(keywords)

        try:
            cmd = ["rg", pattern, "--max-count=5"] + paths
            output = subprocess.check_output(
                cmd, stderr=subprocess.DEVNULL, text=True, timeout=5
            )
            return output
        except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
            logger.warning(f"ripgrep failed for keywords {keywords}")
            return ""

    # ============ Summary Management ============

    def ensure_summaries(
        self, session_id: str, default_goal: str, force: bool = False
    ) -> Dict[str, Any]:
        """
        Ensure Phase 72 summaries exist:
        - Session summary (error counts, clusters, patches)
        - Spec summary (Phase 72 architecture)

        Returns:
            Dict with summary_version, spec_summary_version, summary_text, spec_text, latent_marker
        """
        plan = self.get_plan(session_id)
        goal = plan.get("goal", default_goal)
        spec_files: List[str] = plan.get("spec_files", [])
        summary_version = plan.get("summary_version", 0)
        spec_summary_version = plan.get("spec_summary_version", 0)

        # 1) Timeline summary (error reduction progress)
        summary_key = f"phase72:summary:{session_id}:{summary_version}"
        summary_text = self.redis.get(summary_key) if not force else None

        if not summary_text:
            timeline_text = self.get_timeline_snippet(session_id, limit=80)
            prompt = textwrap.dedent(
                f"""\
                You are summarizing Phase 72's progress on reducing TypeScript errors.

                Goal:
                {goal}

                Timeline events (error counts, clusters, patches):
                {timeline_text}

                Write a concise summary (<= 400 tokens) focused on:
                - Current error count vs starting count
                - Which error clusters have been addressed
                - Which clusters are pending
                - Any blockers (e.g., non-compiling patches)
                - Confidence in next steps
                """
            )
            try:
                summary_text = self.granite.generate(prompt, max_tokens=400)
            except Exception as e:
                logger.error(f"Failed to generate Phase 72 summary: {e}")
                summary_text = f"[Summary generation failed: {e}]"

            summary_version += 1
            summary_key = f"phase72:summary:{session_id}:{summary_version}"
            self.redis.set(summary_key, summary_text, ttl=7 * 24 * 3600)

        # 2) Spec summary (Phase 72 architecture)
        spec_key = f"phase72:spec_summary:{session_id}:{spec_summary_version}"
        spec_text = self.redis.get(spec_key) if not force else None

        if not spec_text:
            keywords = [
                "Neo4j",
                "AST",
                "cluster",
                "TypeScript error",
                "DBSCAN",
                "patch",
                "codemod",
            ]
            raw_spec = self._ripgrep_specs(spec_files, keywords)

            if raw_spec:
                prompt = textwrap.dedent(
                    f"""\
                    You are summarizing the Phase 72 architecture for a self-healing TypeScript codebase.

                    Goal:
                    {goal}

                    Raw spec excerpts:
                    {raw_spec[:2000]}

                    Summarize in <= 350 tokens:
                    - What the Neo4j graph schema represents
                    - How errors are clustered (DBSCAN) & fixed (codemods)
                    - Key invariants (don't break them)
                    - What 'success' looks like (error count target)
                    - How to validate patches (AST parsing, type checking)
                    """
                )
                try:
                    spec_text = self.granite.generate(prompt, max_tokens=350)
                except Exception as e:
                    logger.error(f"Failed to generate Phase 72 spec summary: {e}")
                    spec_text = f"[Spec summary generation failed: {e}]"
            else:
                spec_text = "[No spec files found or ripgrep unavailable]"

            spec_summary_version += 1
            spec_key = f"phase72:spec_summary:{session_id}:{spec_summary_version}"
            self.redis.set(spec_key, spec_text, ttl=7 * 24 * 3600)

        # Update plan with latest versions
        plan["summary_version"] = summary_version
        plan["spec_summary_version"] = spec_summary_version
        plan["updated_at"] = self._now_iso()
        self.redis.set_json(f"phase72:plan:{session_id}", plan)

        # Build latent marker
        latent_marker = f"[[ACA72:{session_id}:s{summary_version}:p{spec_summary_version}]]"

        return {
            "summary_version": summary_version,
            "spec_summary_version": spec_summary_version,
            "summary_text": summary_text,
            "spec_text": spec_text,
            "latent_marker": latent_marker,
            "goal": goal,
        }

    # ============ LLM Prompt Building ============

    def build_phase72_prompt(
        self, session_id: str, default_goal: str, user_message: str
    ) -> Tuple[str, str]:
        """
        Build system + user prompts for Phase 72 agent with ACA context.

        Returns:
            (system_prompt, user_prompt)
        """
        ctx = self.ensure_summaries(session_id, default_goal)
        marker = ctx["latent_marker"]
        summary_text = ctx["summary_text"]
        spec_text = ctx["spec_text"]
        goal = ctx["goal"]

        timeline_excerpt = self.get_timeline_snippet(session_id, limit=10)

        system = textwrap.dedent(
            f"""\
            You are the Phase 72 Neo4j-based AST Error Reduction Agent.

            Session: {session_id}
            Agentic Context Anchor: {marker}

            High-level goal:
            {goal}

            Current progress summary:
            {summary_text}

            Phase 72 spec summary:
            {spec_text}

            IMPORTANT INVARIANTS:
            - Do NOT introduce new runtime errors.
            - Prefer cluster-level codemods over single-file hacks.
            - Keep patches small and reviewable.
            - Always update the progress timeline with what you did.
            - Validate patches with AST parsing before applying.
            """
        ).strip()

        user = textwrap.dedent(
            f"""\
            Operator message:
            {user_message}

            Recent timeline (last few events):
            {timeline_excerpt}

            Decide the single best NEXT ACTION to reduce TypeScript errors.
            Explain the rationale in 1-3 sentences.

            Format your response as:
            ACTION: <action_name>
            REASON: <explanation>
            """
        ).strip()

        return system, user

    # ============ Citation Management (Inverse Ranking) ============

    def add_saved_citation(self, session_id: str, citation_id: str, score: float) -> None:
        """Add a citation to the 'saved' set (user-approved)."""
        key = f"phase72:saved_citations:{session_id}"
        self.redis.zadd(key, {citation_id: score})

    def add_search_citation(self, session_id: str, citation_id: str, score: float) -> None:
        """Add a citation to the 'search' set (transient)."""
        key = f"phase72:search_citations:{session_id}"
        self.redis.zadd(key, {citation_id: score})

    def get_top_citations(
        self, session_id: str, limit: int = 10, saved_boost: float = 3.0
    ) -> List[Tuple[str, float]]:
        """
        Get top citations by combined score (saved boosted).

        Returns:
            List of (citation_id, combined_score) tuples
        """
        saved_key = f"phase72:saved_citations:{session_id}"
        search_key = f"phase72:search_citations:{session_id}"

        saved = self.redis.zrange(saved_key, 0, -1, withscores=True) or []
        search = self.redis.zrange(search_key, 0, -1, withscores=True) or []

        # Combine scores
        combined = {}
        for cit_id, score in saved:
            combined[cit_id] = combined.get(cit_id, 0) + score * saved_boost
        for cit_id, score in search:
            combined[cit_id] = combined.get(cit_id, 0) + score

        # Sort by combined score
        sorted_cits = sorted(combined.items(), key=lambda x: x[1], reverse=True)
        return sorted_cits[:limit]

    # ============ Token Budget Management ============

    def estimate_tokens(self, text: str) -> int:
        """Rough token estimate (1 token ≈ 4 chars)."""
        return len(text) // 4

    def maybe_compact_context(
        self,
        session_id: str,
        default_goal: str,
        token_limit: int = 8192,
        safety_margin: float = 0.7,
    ) -> bool:
        """
        Check if context is getting too large; if so, compact it.

        Returns:
            True if compaction was triggered, False otherwise
        """
        timeline_text = self.get_timeline_snippet(session_id, limit=100)
        est_tokens = self.estimate_tokens(timeline_text)

        threshold = token_limit * safety_margin

        if est_tokens > threshold:
            logger.info(
                f"Phase 72 context approaching limit ({est_tokens} > {threshold}); compacting..."
            )
            # Force re-summarization
            self.ensure_summaries(session_id, default_goal, force=True)

            # Truncate old timeline events (keep last 100)
            key = f"phase72:timeline:{session_id}"
            self.redis.ltrim(key, 0, 99)

            return True

        return False

    # ============ Context Recovery ============

    def recover_context(self, marker: str) -> Dict[str, Any]:
        """
        Decode a latent marker and recover the associated context.

        Marker format: [[ACA72:session_id:s{summary_version}:p{spec_summary_version}]]

        Returns:
            Dict with summary_text, spec_text, plan
        """
        try:
            parts = marker.strip("[]").split(":")
            if len(parts) < 4 or parts[0] != "ACA72":
                return {"error": "Invalid marker format"}

            session_id = parts[1]
            summary_version = int(parts[2][1:])  # s{N} -> N
            spec_summary_version = int(parts[3][1:])  # p{N} -> N
        except (ValueError, IndexError) as e:
            logger.error(f"Failed to parse marker {marker}: {e}")
            return {"error": f"Marker parse error: {e}"}

        # Fetch summaries
        summary_key = f"phase72:summary:{session_id}:{summary_version}"
        spec_key = f"phase72:spec_summary:{session_id}:{spec_summary_version}"

        summary_text = self.redis.get(summary_key) or "[Summary not found]"
        spec_text = self.redis.get(spec_key) or "[Spec summary not found]"
        plan = self.get_plan(session_id)

        return {
            "session_id": session_id,
            "summary_version": summary_version,
            "spec_summary_version": spec_summary_version,
            "summary_text": summary_text,
            "spec_text": spec_text,
            "plan": plan,
        }
