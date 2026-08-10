from __future__ import annotations
from collections import Counter, defaultdict
import math
from typing import Iterable


def packed_context3(a: int, b: int, c: int) -> int:
    return ((a & 0xFF) << 16) | ((b & 0xFF) << 8) | (c & 0xFF)


def packed_event4(a: int, b: int, c: int, nxt: int) -> int:
    return (packed_context3(a, b, c) << 8) | (nxt & 0xFF)


def map_counts(data: bytes) -> Counter[int]:
    out: Counter[int] = Counter()
    for i in range(3, len(data)):
        out[packed_event4(data[i-3], data[i-2], data[i-1], data[i])] += 1
    return out


def reduce_counts(parts: Iterable[Counter[int]]) -> Counter[int]:
    total: Counter[int] = Counter()
    for part in parts:
        total.update(part)
    return total


def probabilities_and_entropy(counts: Counter[int], alpha: float = 0.1):
    by_context: dict[int, Counter[int]] = defaultdict(Counter)
    for event, count in counts.items():
        context = event >> 8
        nxt = event & 0xFF
        by_context[context][nxt] += count
    rows = []
    vocab = 256
    for context, next_counts in sorted(by_context.items()):
        denom = sum(next_counts.values()) + alpha * vocab
        probs = [(nxt, (next_counts.get(nxt, 0) + alpha) / denom) for nxt in range(vocab)]
        entropy = -sum(p * math.log2(p) for _, p in probs)
        for nxt, raw_count in next_counts.items():
            p = (raw_count + alpha) / denom
            rows.append((context, nxt, raw_count, p, -math.log2(p), entropy))
    return rows
