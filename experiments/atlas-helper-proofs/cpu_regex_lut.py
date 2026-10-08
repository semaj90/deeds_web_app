"""Bounded lexical LUT proposal compiler; never ground evidence from regex alone."""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
import json
import re
from typing import Mapping

TOKEN = re.compile(r"[A-Za-z_][A-Za-z_0-9]*")
MAX_TEXT = 65536
MAX_RULES = 256
MAX_TERMS = 64

@dataclass(frozen=True)
class PatternRule:
    rule_id: str
    expression: str
    domain: str
    weight: float = 1.0

@dataclass(frozen=True)
class CompiledLUT:
    version: str
    terms: tuple[tuple[str, str], ...]  # normalized term -> domain
    patterns: tuple[PatternRule, ...]
    checksum: str

def compile_lut(lexicon: Mapping[str, str], patterns: tuple[PatternRule, ...] = ()) -> CompiledLUT:
    if len(lexicon) + len(patterns) > MAX_RULES:
        raise ValueError("RULE_LIMIT")
    terms = []
    for term, domain in lexicon.items():
        if not isinstance(term, str) or not TOKEN.fullmatch(term) or not isinstance(domain, str) or not TOKEN.fullmatch(domain):
            raise ValueError("INVALID_LUT_TERM")
        terms.append((term.casefold(), domain))
    if len(set(t for t, _ in terms)) != len(terms):
        raise ValueError("DUPLICATE_NORMALIZED_TERM")
    seen = set()
    for rule in patterns:
        if not TOKEN.fullmatch(rule.rule_id) or rule.rule_id in seen or not TOKEN.fullmatch(rule.domain) or not 0 <= rule.weight <= 10:
            raise ValueError("INVALID_PATTERN_RULE")
        seen.add(rule.rule_id)
        # Limit syntax to literals, word boundaries, groups/alternatives and simple whitespace.
        # Reject wildcards, lookarounds, backreferences, unbounded quantifiers and nested repetition.
        if len(rule.expression) > 128 or not re.fullmatch(r"[A-Za-z_0-9|()\\b\\s ?-]+", rule.expression):
            raise ValueError("UNSAFE_PATTERN")
        try:
            re.compile(rule.expression, re.IGNORECASE | re.ASCII)
        except re.error as exc:
            raise ValueError("INVALID_PATTERN") from exc
    terms = tuple(sorted(terms))
    patterns = tuple(sorted(patterns, key=lambda p: p.rule_id))
    body = {"terms": terms, "patterns": [vars(p) for p in patterns]}
    digest = sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()
    return CompiledLUT("atlas.cpu-lexical-lut.v1", terms, patterns, "sha256:" + digest)

def extract_lut_features(text: str, lut: CompiledLUT) -> dict:
    if not isinstance(text, str) or len(text.encode("utf-8")) > MAX_TEXT:
        raise ValueError("TEXT_LIMIT")
    if lut.version != "atlas.cpu-lexical-lut.v1":
        raise ValueError("LUT_VERSION")
    words = set(t.casefold() for t in TOKEN.findall(text))
    hits = [(term, domain) for term, domain in lut.terms if term in words][:MAX_TERMS]
    pattern_hits = [(p.rule_id, p.domain, p.weight) for p in lut.patterns
                    if re.search(p.expression, text, re.IGNORECASE | re.ASCII)][:MAX_TERMS]
    scores: dict[str, float] = {}
    for _, domain in hits:
        scores[domain] = scores.get(domain, 0.0) + 1.0
    for _, domain, weight in pattern_hits:
        scores[domain] = scores.get(domain, 0.0) + weight
    return {"schema": "atlas.cpu-lexical-proposal.v1", "lut_checksum": lut.checksum,
            "token_hits": hits, "pattern_hits": pattern_hits, "domain_scores": dict(sorted(scores.items())),
            "admitted": False, "canonical_authority": False}

def lut_to_mlp_inputs(features: dict, registry: Mapping[str, int]) -> dict[str, float]:
    """Maps only explicitly registered domain-score slots, never arbitrary inputs."""
    scores = features["domain_scores"]
    out = {}
    for domain, score in scores.items():
        key = "domain_" + domain.casefold()
        if key in registry:
            out[key] = float(score)
    return out
