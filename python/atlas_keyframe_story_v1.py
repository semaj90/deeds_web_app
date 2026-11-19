"""Keyframe story summary (evidence-cited). Pure logic over an analysis receipt; no model calls.

Every statement carries its evidence (frame time, box, OCR words, or a computed delta). Nothing is
identity or role. Facts the evidence cannot support go to open_questions. Each frame carries a
review block that a human reviewer fills in; the builder never sets reviewed=true.
"""
from __future__ import annotations

from collections import Counter

LARGE_PERSON_AREA_FRACTION = 0.10  # a person box above this share of the frame counts as "large"


def _area(b):
    x0, y0, x1, y1 = b
    return max(0.0, x1 - x0) * max(0.0, y1 - y0)


def _centre(b):
    x0, y0, x1, y1 = b
    return ((x0 + x1) / 2.0, (y0 + y1) / 2.0)


def _ocr_text(frame: dict) -> str:
    words = frame.get("fullFrameOcr", {}).get("enhanced") or frame.get("fullFrameOcr", {}).get("raw") or []
    return " ".join(w["text"] for w in words)


def frame_facts(frame: dict) -> dict:
    w, h = frame["imageSize"]
    frame_area = float(w * h)
    boxes = frame.get("boxes", [])
    counts = Counter(b["classLabel"] for b in boxes)
    persons = [b for b in boxes if b["classLabel"] == "person"]
    largest = max(persons, key=lambda b: _area(b["bboxXYXY"])) if persons else None
    facts = [{
        "statement": f"{len(boxes)} detections: " + ", ".join(f"{n} {k}" for k, n in sorted(counts.items())),
        "evidence": {"framePtsMs": frame["framePtsMs"], "source": "yolox_boxes"},
    }]
    if largest is not None:
        share = _area(largest["bboxXYXY"]) / frame_area
        facts.append({
            "statement": f"Largest person box covers {share:.1%} of the frame (heuristic: size only, no identity)",
            "evidence": {"framePtsMs": frame["framePtsMs"], "bboxXYXY": largest["bboxXYXY"], "source": "yolox_box_area"},
        })
    text = _ocr_text(frame).strip()
    if text:
        facts.append({
            "statement": f'On-screen text (OCR): "{text[:200]}"',
            "evidence": {"framePtsMs": frame["framePtsMs"], "source": "tesseract_enhanced_pass"},
        })
    role_props = frame.get("roleEvidence", {}).get("proposals", [])
    for p in role_props:
        facts.append({
            "statement": f"Unreviewed textual role proposal: {p['role']} near '{p['name']}' ({p['basis']}); ontology matches are suggestions only.",
            "evidence": {"framePtsMs": frame["framePtsMs"], "source": "role_evidence",
                         "spans": p.get("evidence"),
                         "taxonomySuggestion": p.get("taxonomySuggestion")},
        })
    open_q = []
    if not role_props:
        open_q.append("No textual role evidence in this frame; roles remain unknown.")
    if not text:
        open_q.append("No readable on-screen text; speaker and setting are not determined from text.")
    open_q.append("Identity of every person is not determined by the frame itself.")
    return {
        "framePtsMs": frame["framePtsMs"],
        "facts": facts,
        "openQuestions": open_q,
        "_largest": largest,
        "_counts": dict(counts),
        "_text": text,
    }


def transitions(a: dict, b: dict, frame_a: dict, frame_b: dict) -> list[dict]:
    """Computed changes between consecutive keyframes. Each is a measured delta, not an interpretation."""
    out = []
    dt = b["framePtsMs"] - a["framePtsMs"]
    pa, pb = a["_counts"].get("person", 0), b["_counts"].get("person", 0)
    if pa != pb:
        out.append({"statement": f"Person count changes {pa} -> {pb} over {dt} ms",
                    "evidence": {"fromPtsMs": a["framePtsMs"], "toPtsMs": b["framePtsMs"], "source": "yolox_counts"}})
    la, lb = a["_largest"], b["_largest"]
    if la and lb:
        ca, cb = _centre(la["bboxXYXY"]), _centre(lb["bboxXYXY"])
        dist = ((cb[0] - ca[0]) ** 2 + (cb[1] - ca[1]) ** 2) ** 0.5
        w = frame_a["imageSize"][0]
        if dist > 0.05 * w:
            out.append({"statement": f"Largest person's box centre moves {dist:.0f} px ({dist / w:.1%} of frame width)",
                        "evidence": {"fromPtsMs": a["framePtsMs"], "toPtsMs": b["framePtsMs"], "source": "yolox_box_centre"}})
        else:
            out.append({"statement": f"Largest person's box centre stays within {dist / w:.1%} of frame width",
                        "evidence": {"fromPtsMs": a["framePtsMs"], "toPtsMs": b["framePtsMs"], "source": "yolox_box_centre"}})
    if a["_text"] != b["_text"]:
        out.append({"statement": "On-screen text changes between keyframes",
                    "evidence": {"fromPtsMs": a["framePtsMs"], "toPtsMs": b["framePtsMs"], "source": "ocr"}})
    return out


def build_story(receipt: dict) -> dict:
    frames = sorted(receipt["frames"], key=lambda f: f["framePtsMs"])
    facts = [frame_facts(f) for f in frames]
    trans = []
    for i in range(len(facts) - 1):
        trans += transitions(facts[i], facts[i + 1], frames[i], frames[i + 1])
    entries = []
    for f in facts:
        entries.append({k: v for k, v in f.items() if not k.startswith("_")} | {
            "review": {"reviewed": False, "reviewer": None, "label": None, "note": None}})
    return {
        "schema": "keyframe-story-summary.v1",
        "status": "EVIDENCE_CITED_DRAFT__NOT_REVIEWED__NOT_IDENTITY",
        "sourceReceipt": "docs/reports/keyframe-analysis-run-receipt-20261118.json",
        "frames": entries,
        "transitions": trans,
    }
