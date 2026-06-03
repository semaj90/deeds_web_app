"""
langgraph_sidecar.py — LangGraph orchestration sidecar for Omni-Worker.

Orchestration-only: reads task intents from RabbitMQ (or stdin), runs a
LangGraph workflow to decompose them into sub-steps, and publishes results
back. Does NOT write to the database directly — all DB writes go through
SvelteKit API routes.

Hard rule: LangGraph is planner only. State transitions produce JSON task
packets consumed by Node.js pipeline scripts.
"""

import os
import json
import asyncio
import logging
from typing import TypedDict, Annotated

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("omni-worker")


# ── Stub: import LangGraph when available ─────────────────────────────
try:
    from langgraph.graph import StateGraph, END
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    log.warning("LangGraph not installed — running in stub mode")


class TaskState(TypedDict):
    task_id: str
    intent: str
    sub_steps: list[str]
    results: list[dict]
    done: bool


def plan_node(state: TaskState) -> TaskState:
    """Decompose intent into sub-steps (placeholder — replace with LLM call)."""
    log.info(f"Planning task: {state['intent']}")
    state["sub_steps"] = [f"step_{i}" for i in range(3)]
    return state


def execute_node(state: TaskState) -> TaskState:
    """Execute sub-steps (placeholder — real impl calls Node.js addon or API)."""
    state["results"] = [{"step": s, "ok": True} for s in state["sub_steps"]]
    state["done"] = True
    return state


def build_graph():
    if not LANGGRAPH_AVAILABLE:
        return None
    g = StateGraph(TaskState)
    g.add_node("plan", plan_node)
    g.add_node("execute", execute_node)
    g.set_entry_point("plan")
    g.add_edge("plan", "execute")
    g.add_edge("execute", END)
    return g.compile()


async def main():
    log.info("Omni-Worker LangGraph sidecar starting")

    graph = build_graph()
    if graph is None:
        log.info("Stub mode — sleeping (install langgraph to enable real orchestration)")
        await asyncio.sleep(3600)
        return

    # Minimal smoke: run one test task
    result = graph.invoke({
        "task_id": "smoke-001",
        "intent": "index codebase chunks",
        "sub_steps": [],
        "results": [],
        "done": False,
    })
    log.info(f"Smoke result: {json.dumps(result, indent=2)}")
    log.info("Omni-Worker ready — awaiting tasks via RabbitMQ (not yet wired)")

    # TODO: consume from RabbitMQ queue 'omni.tasks' and loop
    await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
