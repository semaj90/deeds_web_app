"""
ACE (Autonomous Coding Engine) Orchestrator
Integrates: ACA timeline, Phase 72 context, tool execution, LLM planning
"""
from __future__ import annotations
from typing import Dict, Any, Optional, List
import os
import httpx
from datetime import datetime

from .tool_router import ToolRouter, ToolExecutionError
from .guardrails import guardrail, GuardrailResult

class ACEOrchestrator:
    """
    Autonomous Coding Engine - Plans and executes actions to reduce errors
    """

    def __init__(
        self,
        tool_router: ToolRouter,
        ollama_base: str | None = None,
        model: str | None = None,
    ):
        self.tool_router = tool_router
        self.ollama_base = ollama_base or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.model = model or os.getenv("ACE_MODEL", "gemma3-legal:latest")

        # Session state
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def _get_session(self, session_id: str) -> Dict[str, Any]:
        """Get or create session state"""
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "id": session_id,
                "created_at": datetime.utcnow().isoformat(),
                "history": [],
                "context": {},
                "goal": "Reduce TypeScript errors to zero",
                "progress": 0.0
            }
        return self.sessions[session_id]

    async def plan_next_action(
        self,
        session_id: str,
        user_message: str,
        role: str = "warden",
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Plan the next action using LLM + available tools

        Returns:
          {
            "tool": str,
            "args": dict,
            "reasoning": str,
            "aca_marker": str,
            "raw_llm_output": str
          }
        """
        session = self._get_session(session_id)
        ctx = context or session["context"]

        # Build tool list
        tools = self.tool_router.list_tools()
        tool_descriptions = "\n".join([
            f"- {name}: {desc}" for name, desc in tools.items()
        ])

        # Build prompt
        prompt = f"""You are ACE (Autonomous Coding Engine), an AI agent that reduces TypeScript/Svelte errors.

Session: {session_id}
Role: {role}
Goal: {session.get('goal', 'Reduce errors to zero')}
Progress: {session.get('progress', 0.0):.1%}

Current context:
{ctx.get('summary', 'No context yet')}

Available tools:
{tool_descriptions}

User message: {user_message}

Respond in this format ONLY:

TOOL: <tool_name>
ARGS: <json-dict>
REASON: <short explanation>

Example:
TOOL: minio_get_chunks
ARGS: {{"doc_id": "ast-snapshot-123"}}
REASON: Need to fetch AST chunks to analyze error patterns
""".strip()

        # Call LLM
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.ollama_base}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False
                }
            )
            resp.raise_for_status()
            llm_output = resp.json()["response"]

        # Parse LLM output
        parsed = self._parse_llm_output(llm_output)

        # Add to session history
        session["history"].append({
            "timestamp": datetime.utcnow().isoformat(),
            "user_message": user_message,
            "tool": parsed["tool"],
            "args": parsed["args"],
            "reasoning": parsed["reasoning"]
        })

        return {
            **parsed,
            "raw_llm_output": llm_output,
            "aca_marker": f"ace:{session_id}:{len(session['history'])}"
        }

    def _parse_llm_output(self, output: str) -> Dict[str, Any]:
        """Parse LLM output into structured format"""
        import json
        import re

        tool = "unknown"
        args = {}
        reasoning = ""

        # Extract TOOL
        tool_match = re.search(r"TOOL:\s*(\w+)", output)
        if tool_match:
            tool = tool_match.group(1)

        # Extract ARGS
        args_match = re.search(r"ARGS:\s*(\{[^}]+\})", output, re.DOTALL)
        if args_match:
            try:
                args = json.loads(args_match.group(1))
            except:
                pass

        # Extract REASON
        reason_match = re.search(r"REASON:\s*(.+?)(?:\n|$)", output)
        if reason_match:
            reasoning = reason_match.group(1).strip()

        return {
            "tool": tool,
            "args": args,
            "reasoning": reasoning
        }

    async def execute_action(
        self,
        session_id: str,
        tool: str,
        args: Dict[str, Any],
        last_rag_result: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute a planned action with guardrail checks"""
        session = self._get_session(session_id)

        # Check guardrails before execution
        guard_result = guardrail.check(
            tool_name=tool,
            tool_args=args,
            last_rag_result=last_rag_result,
            context=context
        )

        if not guard_result.allowed:
            # Blocked by guardrail
            session["history"][-1]["guardrail_blocked"] = True
            session["history"][-1]["guardrail_reason"] = guard_result.reason
            session["history"][-1]["similarity_score"] = guard_result.score

            return {
                "success": False,
                "blocked_by_guardrail": True,
                "reason": guard_result.reason,
                "similarity_score": guard_result.score,
                "similarity_threshold": guard_result.threshold,
                "similarity_band": guardrail.get_band(guard_result.score),
                "tool": tool,
                "args": args,
                "suggestion": "Please confirm context or refine your request"
            }

        # Guardrail passed, execute tool
        try:
            result = await self.tool_router.execute_async(tool, args)

            # Update session
            session["history"][-1]["result"] = result
            session["history"][-1]["success"] = True
            session["history"][-1]["similarity_score"] = guard_result.score

            return {
                "success": True,
                "result": result,
                "similarity_score": guard_result.score,
                "similarity_band": guardrail.get_band(guard_result.score),
                "tool": tool,
                "args": args
            }

        except ToolExecutionError as e:
            session["history"][-1]["error"] = str(e)
            session["history"][-1]["success"] = False

            return {
                "success": False,
                "error": str(e),
                "tool": tool,
                "args": args
            }

    async def plan_and_execute(
        self,
        session_id: str,
        user_message: str,
        role: str = "warden",
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Plan and execute in one call"""
        # Plan
        plan = await self.plan_next_action(session_id, user_message, role, context)

        # Execute
        result = await self.execute_action(session_id, plan["tool"], plan["args"])

        return {
            **plan,
            "executed": True,
            "execution_result": result
        }

    def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get session summary for ACA timeline"""
        session = self._get_session(session_id)

        return {
            "session_id": session_id,
            "goal": session["goal"],
            "progress": session["progress"],
            "actions_taken": len(session["history"]),
            "last_action": session["history"][-1] if session["history"] else None,
            "created_at": session["created_at"]
        }

# Global instance
ace_orchestrator = ACEOrchestrator(tool_router=ToolRouter())
