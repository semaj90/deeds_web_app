"""Cheap, deterministic regex/LUT NLP features. Routing hints only, never evidence."""
import math
import re
from collections import Counter
from dataclasses import dataclass

TOKEN = re.compile(r"[A-Za-z_][A-Za-z_0-9]*")
PATTERNS = {
    "error": (r"\b(?:error|exception|failed|traceback|panic)\b",),
    "database": (r"\b(?:postgres|drizzle|sql|transaction|schema)\b",),
    "retrieval": (r"\b(?:search|retrieve|semantic|vector|embedding|qdrant)\b",),
    "graph": (r"\b(?:graph|edge|node|dag|pagerank|dependency)\b",),
    "gpu": (r"\b(?:cuda|cuvs|gpu|tensor|kernel)\b",),
    "api": (r"\b(?:endpoint|fastapi|grpc|http|route|request)\b",),
}
LUT = {name: tuple(re.compile(p, re.I) for p in pats) for name,pats in PATTERNS.items()}

@dataclass(frozen=True)
class Hint:
    domain: str
    score: float
    matched_count: int

def tokenize(text: str, limit: int = 20000) -> tuple[str,...]:
    if not isinstance(text,str) or len(text) > limit:
        raise ValueError("INVALID_TEXT")
    return tuple(x.group(0).lower() for x in TOKEN.finditer(text))

def classify(text: str) -> tuple[Hint,...]:
    tokens = tokenize(text)
    counts = Counter(tokens)
    total = max(1,len(tokens))
    results = []
    for domain, regexes in LUT.items():
        matched = sum(count for word,count in counts.items() if any(p.fullmatch(word) for p in regexes))
        results.append(Hint(domain, matched / total, matched))
    return tuple(sorted(results, key=lambda h:(-h.score,h.domain)))

def features(text: str) -> dict[str,float]:
    hints = classify(text)
    return {f"lut_{h.domain}": h.score for h in hints}
