"""
Agentic Function Registry
A small registry that maps string names to callable functions the agent can call.
"""
from typing import Any, Dict
from .gemma_api import get_gemma_embedding
from .gpu_metrics import tensor_core_dot, cosine_similarity_gpu


def web_search(query: str) -> Dict[str, Any]:
    # placeholder web search
    return {"results": [], "query": query}


def summarize_clusters(clusters: Any) -> str:
    # placeholder summary
    return "; ".join([str(c) for c in clusters])

AGENTIC_FUNCTIONS: Dict[str, Any] = {
    "web_search": web_search,
    "expand_context": get_gemma_embedding,
    "summarize_clusters": summarize_clusters,
    # add more functions dynamically
}


def call_agent_function(func_name: str, *args, **kwargs):
    if func_name not in AGENTIC_FUNCTIONS:
        raise ValueError(f"Unknown function {func_name}")
    return AGENTIC_FUNCTIONS[func_name](*args, **kwargs)
