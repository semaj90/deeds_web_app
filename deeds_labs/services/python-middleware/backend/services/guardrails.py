"""
Guardrails for ACE - Similarity-based edit protection
"""
from __future__ import annotations
from typing import Dict, Any, Optional, Set
from dataclasses import dataclass

# Tools that modify code/files (write-risk)
WRITE_TOOLS: Set[str] = {
    "run_svelte_check_fix",
    "cluster_errors_apply",
    "rewrite_file",
    "create_file",
    "apply_patch",
    "apply_ts_morph_fix",
    "apply_codemod",
    "ace_execute_action",  # When action involves editing
}

# Production routes that require extra caution
PRODUCTION_ROUTES: Set[str] = {
    "/login",
    "/dashboard",
    "/cases",
    "/evidence",
    "/ai-chat",
    "/command-center",
    "/evidence-board",
}

@dataclass
class GuardrailResult:
    allowed: bool
    reason: str
    score: float
    threshold: float
    blocked_tool: Optional[str] = None

class SimilarityGuardrail:
    """
    Enforces similarity thresholds before allowing write operations
    """

    def __init__(
        self,
        default_threshold: float = 0.92,
        prod_route_threshold: float = 0.95,
        demo_mode: bool = False
    ):
        self.default_threshold = default_threshold
        self.prod_route_threshold = prod_route_threshold
        self.demo_mode = demo_mode

    def check(
        self,
        tool_name: str,
        tool_args: Dict[str, Any],
        last_rag_result: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> GuardrailResult:
        """
        Check if tool execution should be allowed based on similarity

        Args:
            tool_name: Name of tool to execute
            tool_args: Tool arguments
            last_rag_result: Last RAG search result with score
            context: Additional context (route_path, etc.)

        Returns:
            GuardrailResult with allowed flag and reason
        """
        # Demo mode: allow everything
        if self.demo_mode:
            return GuardrailResult(
                allowed=True,
                reason="Demo mode: all tools allowed",
                score=1.0,
                threshold=0.0
            )

        # Read-only tools: always allow
        if tool_name not in WRITE_TOOLS:
            return GuardrailResult(
                allowed=True,
                reason="Read-only or safe tool",
                score=1.0,
                threshold=0.0
            )

        # Get similarity score
        score = (last_rag_result or {}).get("score", 0.0)

        # Determine threshold based on context
        threshold = self.default_threshold
        route_path = (context or {}).get("route_path", "")

        if any(prod_route in route_path for prod_route in PRODUCTION_ROUTES):
            threshold = self.prod_route_threshold

        # Check threshold
        if score >= threshold:
            return GuardrailResult(
                allowed=True,
                reason=f"Similarity {score:.3f} >= {threshold:.3f}",
                score=score,
                threshold=threshold
            )

        # Blocked
        return GuardrailResult(
            allowed=False,
            reason=f"Similarity {score:.3f} < {threshold:.3f}; requires human approval",
            score=score,
            threshold=threshold,
            blocked_tool=tool_name
        )

    def get_band(self, score: float) -> str:
        """Get similarity band label"""
        if score >= 0.92:
            return "High"
        elif score >= 0.80:
            return "Medium"
        else:
            return "Low"

# Global instance
guardrail = SimilarityGuardrail()
