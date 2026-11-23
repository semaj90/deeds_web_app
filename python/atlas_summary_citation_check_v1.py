"""Citation checker for AI-drafted summaries. Pure logic; no model call.

A summary is a list of sentences, each with the fact IDs it relies on. A sentence passes only if
it cites at least one fact ID that exists in the supplied fact set. Failed sentences are KEPT in
the receipt with their reason, never silently dropped. The result is a draft until reviewed.
"""
from __future__ import annotations


def check_summary(facts: dict[str, str], sentences: list[dict]) -> dict:
    """facts: {fact_id: statement}. sentences: [{'text': str, 'citations': [fact_id, ...]}]."""
    results = []
    for i, s in enumerate(sentences):
        cites = s.get("citations") or []
        unknown = [c for c in cites if c not in facts]
        if not cites:
            verdict, reason = "REJECTED", "NO_CITATION"
        elif unknown:
            verdict, reason = "REJECTED", "UNKNOWN_FACT_ID:" + ",".join(unknown)
        else:
            verdict, reason = "SUPPORTED", None
        results.append({"index": i, "text": s.get("text", ""), "citations": cites,
                        "verdict": verdict, "reason": reason})
    supported = sum(1 for r in results if r["verdict"] == "SUPPORTED")
    return {
        "schema": "summary-citation-check.v1",
        "status": "DRAFT_NOT_REVIEWED",
        "sentences": len(results),
        "supported": supported,
        "rejected": len(results) - supported,
        "results": results,
    }
