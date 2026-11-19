"""Human review queue for keyframe story summaries. Local JSON only; no database.

Build: one item per open question per frame, and one per computed transition to confirm.
Apply: a review is recorded only with a named reviewer and a label from the vocabulary.
The builder never fills reviewer or label fields.
"""
from __future__ import annotations

import copy

LABEL_VOCAB = ["main_character", "poi", "victim", "suspect", "witness", "officer", "judge",
               "paramedic", "doctor", "employee", "bystander", "npc", "unknown_person",
               "furniture", "object", "not_applicable", "cannot_determine"]


def build_queue(story: dict) -> dict:
    items = []
    for f in story["frames"]:
        for q in f["openQuestions"]:
            items.append({"itemId": f"f{f['framePtsMs']}-q{len(items)}", "kind": "open_question",
                          "framePtsMs": f["framePtsMs"], "question": q, "suggestedLabels": LABEL_VOCAB,
                          "review": {"status": "PENDING", "reviewer": None, "label": None, "note": None}})
    for i, t in enumerate(story["transitions"]):
        items.append({"itemId": f"t{i}", "kind": "transition", "evidence": t["evidence"],
                      "statement": t["statement"],
                      "review": {"status": "PENDING", "reviewer": None, "verdict": None, "note": None}})
    return {"schema": "keyframe-review-queue.v1", "status": "AWAITING_HUMAN_REVIEW",
            "sourceSummary": story.get("sourceReceipt"), "items": items}


def apply_review(queue: dict, item_id: str, reviewer: str, *, label: str | None = None,
                 verdict: str | None = None, note: str | None = None) -> dict:
    """Return a new queue with one item reviewed. Refuses anonymous or invalid reviews."""
    if not reviewer or not reviewer.strip():
        raise ValueError("REVIEWER_REQUIRED")
    out = copy.deepcopy(queue)
    matches = [it for it in out["items"] if it["itemId"] == item_id]
    if len(matches) != 1:
        raise ValueError("ITEM_NOT_FOUND")
    item = matches[0]
    if item["kind"] == "open_question":
        if label not in LABEL_VOCAB:
            raise ValueError("LABEL_NOT_IN_VOCABULARY")
        item["review"] = {"status": "REVIEWED", "reviewer": reviewer.strip(), "label": label, "note": note}
    else:
        if verdict not in ("confirmed", "rejected", "unclear"):
            raise ValueError("VERDICT_INVALID")
        item["review"] = {"status": "REVIEWED", "reviewer": reviewer.strip(), "verdict": verdict, "note": note}
    return out
