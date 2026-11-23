"""Role evidence helper (textual). Calls the existing :8095 /extract route, then proposes roles only
when role words in the text sit next to a detected person name. Appearance is never used.

Output is PROPOSALS with grounded spans: status 'proposed', never identity. A role becomes usable
only after operator review. No change to the :8095 service is required.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request

SIDECAR_URL = os.environ.get("MINIFORGE_SIDECAR_URL") or os.environ.get("LANGEXTRACT_URL") or "http://127.0.0.1:8095"

ROLE_LEXICON: dict[str, tuple[str, ...]] = {
    "judge": ("judge", "justice", "your honor"),
    "victim": ("victim",),
    "suspect": ("suspect",),
    "defendant": ("defendant", "accused"),
    "witness": ("witness",),
    "officer": ("officer", "constable", "policeman", "policewoman"),
    "detective": ("detective", "inspector"),
    "prosecutor": ("prosecutor", "prosecution"),
    "defense_attorney": ("defense attorney", "defence attorney", "defense lawyer", "counsel"),
    "bailiff": ("bailiff",),
    "clerk": ("clerk",),
    "paramedic": ("paramedic", "emt"),
    "doctor": ("doctor", "dr.", "physician"),
    "employee": ("employee", "staff", "receptionist"),
    "security_guard": ("security guard", "guard"),
    "bystander": ("bystander", "passerby"),
}

# Capitalised name directly after a title, e.g. "Officer Smith", "Detective Lee".
TITLE_NAME = re.compile(r"\b(?P<role>[A-Z][a-z]+)\s+(?P<name>[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")


def find_role_mentions(text: str) -> list[dict]:
    mentions = []
    lowered = text.lower()
    for role, phrases in ROLE_LEXICON.items():
        for phrase in phrases:
            for m in re.finditer(r"(?<![a-z])" + re.escape(phrase) + r"(?![a-z])", lowered):
                mentions.append({"role": role, "phrase": phrase, "start": m.start(), "end": m.end(),
                                 "text": text[m.start():m.end()]})
    return sorted(mentions, key=lambda x: x["start"])


SENTENCE_BREAK = re.compile(r"[.!?:;\n]")


def _same_sentence(text: str, a: int, b: int) -> bool:
    lo, hi = sorted((a, b))
    return SENTENCE_BREAK.search(text, lo, hi) is None


def propose_roles(text: str, person_entities: list[dict], max_gap_chars: int = 40) -> list[dict]:
    """Pair each role mention with the nearest person entity in the SAME sentence within
    max_gap_chars, or with a title-plus-name pattern. Duplicate (role, name) pairs are merged.
    Returns proposals; nothing is accepted as identity here."""
    proposals = []
    mentions = find_role_mentions(text)
    for mention in mentions:
        candidate = None
        for ent in person_entities:
            gap = min(abs(ent["start"] - mention["end"]), abs(mention["start"] - ent["end"]))
            if gap > max_gap_chars:
                continue
            if not _same_sentence(text, mention["start"], ent["start"]):
                continue
            if candidate is None or gap < candidate[0]:
                candidate = (gap, ent)
        if candidate is not None:
            ent = candidate[1]
            proposals.append({
                "role": mention["role"],
                "name": ent["text"],
                "status": "proposed",
                "basis": "role_word_near_person_entity",
                "evidence": [
                    {"kind": "role_word", "text": mention["text"], "start": mention["start"], "end": mention["end"]},
                    {"kind": "person_entity", "text": ent["text"], "start": ent["start"], "end": ent["end"],
                     "source": ent.get("source")},
                ],
            })
    for m in TITLE_NAME.finditer(text):
        role_word = m.group("role").lower()
        for role, phrases in ROLE_LEXICON.items():
            if role_word in phrases:
                proposals.append({
                    "role": role,
                    "name": m.group("name"),
                    "status": "proposed",
                    "basis": "title_before_name",
                    "evidence": [{"kind": "title", "text": m.group(0), "start": m.start(), "end": m.end()}],
                })
    merged: dict[tuple[str, str], dict] = {}
    for p in proposals:
        key = (p["role"], p["name"])
        if key not in merged:
            merged[key] = p
        else:
            merged[key]["evidence"].extend(e for e in p["evidence"] if e not in merged[key]["evidence"])
            merged[key]["basis"] = merged[key]["basis"] + "+" + p["basis"] if p["basis"] not in merged[key]["basis"] else merged[key]["basis"]
    return list(merged.values())


def call_extract(text: str, source_ref: str, timeout_s: float = 60.0, base_url: str = SIDECAR_URL) -> dict:
    body = json.dumps({"text": text, "sourceRef": source_ref, "documentType": "transcript"}).encode()
    req = urllib.request.Request(f"{base_url.rstrip('/')}/extract", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return json.loads(resp.read().decode())


def oak_taxonomy_suggestions(role: str, base_url: str = SIDECAR_URL) -> dict:
    """Return bounded OAK label suggestions; this never resolves or accepts a role.

    Role values come from ROLE_LEXICON, not model-generated text. OAK search is advisory:
    its response explicitly has canonicalAuthority=false, and no match is auto-selected.
    """
    if role not in ROLE_LEXICON:
        return {"state": "ROLE_NOT_IN_LEXICON", "query": role, "matches": [],
                "canonicalAuthority": False}
    body = json.dumps({"query": role.replace("_", " "), "limit": 5}).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/oak/search", data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            result = json.loads(resp.read().decode())
        matches = []
        for match in result.get("matches", [])[:5]:
            entity_id, label = match.get("entityId"), match.get("label")
            if isinstance(entity_id, str) and entity_id and (label is None or isinstance(label, str)):
                matches.append({"entityId": entity_id, "label": label})
        # Do not trust an adapter to elevate OAK's authority in this proposal lane.
        return {
            "state": "SUGGESTIONS_AVAILABLE" if matches else "NO_MATCHES",
            "query": role.replace("_", " "),
            "matches": matches,
            "canonicalAuthority": False,
        }
    except Exception as exc:
        return {"state": "OAK_UNAVAILABLE", "query": role.replace("_", " "),
                "matches": [], "canonicalAuthority": False,
                "error": type(exc).__name__}


def extract_role_proposals(text: str, source_ref: str = "scratch:role-evidence", base_url: str = SIDECAR_URL) -> dict:
    if len(text) > 50_000:
        raise ValueError("ROLE_EVIDENCE_TEXT_TOO_LARGE")
    if not text.strip():
        return {"status": "NO_TEXT", "sidecarRevision": None, "textSha256": None,
                "personEntities": [], "proposals": []}
    # Avoid an :8095 request for ordinary UI OCR or dialogue that contains no role term.
    if not find_role_mentions(text):
        import hashlib
        return {"status": "NO_ROLE_TERMS", "sidecarRevision": None,
                "textSha256": "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "personEntities": [], "proposals": []}
    result = call_extract(text, source_ref, base_url=base_url)
    persons = []
    for entity in result.get("entities", []):
        if entity.get("label") != "PERSON":
            continue
        start, end, name = entity.get("start"), entity.get("end"), entity.get("text")
        if not isinstance(name, str) or not name or not isinstance(start, int) or not isinstance(end, int):
            continue
        if start < 0 or end <= start or end > len(text) or text[start:end] != name:
            continue
        persons.append(entity)
    proposals = propose_roles(text, persons)
    # Bound repeated OAK calls within this one text; do not retain empty or unavailable
    # results across runs, so newly loaded ontology terms become visible immediately.
    taxonomy_by_role = {}
    for proposal in proposals:
        role = proposal["role"]
        if role not in taxonomy_by_role:
            taxonomy_by_role[role] = oak_taxonomy_suggestions(role, base_url)
        proposal["taxonomySuggestion"] = taxonomy_by_role[role]
    return {
        "status": "PROPOSALS_ONLY__NOT_IDENTITY",
        "sidecarRevision": result.get("metadata", {}).get("provider_revision"),
        "textSha256": result.get("metadata", {}).get("text_sha256"),
        "personEntities": persons,
        "proposals": proposals,
    }
