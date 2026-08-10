from __future__ import annotations

from dataclasses import dataclass, field

@dataclass
class Node:
    node_id: str
    bounds: tuple[float, float, float, float, float, float, float, float]
    tile_keys: list[str] = field(default_factory=list)
    children: list["Node"] = field(default_factory=list)

    def contains(self, point: tuple[float,float,float,float]) -> bool:
        x0,x1,y0,y1,a0,a1,e0,e1 = self.bounds
        x,y,a,e = point
        return x0 <= x <= x1 and y0 <= y <= y1 and a0 <= a <= a1 and e0 <= e <= e1


def collect(node: Node, point: tuple[float,float,float,float]) -> list[str]:
    if not node.contains(point): return []
    out = list(node.tile_keys)
    for child in node.children: out.extend(collect(child, point))
    return sorted(set(out))
