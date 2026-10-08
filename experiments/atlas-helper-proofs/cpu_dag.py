"""Deterministic CPU DAG oracle without production Graphify side effects."""
from collections import deque

def topological_order(edges: list[tuple[str, str]], nodes: list[str]) -> list[str]:
    if len(set(nodes)) != len(nodes):
        raise ValueError("DUPLICATE_NODE")
    incoming = {n: 0 for n in nodes}
    adjacent = {n: set() for n in nodes}
    for a,b in edges:
        if a not in incoming or b not in incoming:
            raise ValueError("UNKNOWN_NODE")
        if b not in adjacent[a]:
            adjacent[a].add(b)
            incoming[b] += 1
    ready = sorted(n for n in nodes if incoming[n] == 0)
    out = []
    while ready:
        n = ready.pop(0)
        out.append(n)
        for next_node in sorted(adjacent[n]):
            incoming[next_node] -= 1
            if incoming[next_node] == 0:
                ready.append(next_node)
                ready.sort()
    if len(out) != len(nodes):
        raise ValueError("CYCLE_DETECTED")
    return out

def reachable(edges: list[tuple[str, str]], origin: str, limit: int = 100) -> list[str]:
    if limit < 1:
        raise ValueError("INVALID_LIMIT")
    neighbors = {}
    for a,b in edges:
        neighbors.setdefault(a, set()).add(b)
    seen = {origin}
    queue = deque([origin])
    while queue and len(seen) < limit:
        n = queue.popleft()
        for b in sorted(neighbors.get(n, ())):
            if b not in seen:
                seen.add(b)
                queue.append(b)
                if len(seen) == limit:
                    break
    return sorted(seen)
