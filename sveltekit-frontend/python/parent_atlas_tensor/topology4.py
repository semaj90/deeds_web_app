from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class Topology4:
    som_x: int
    som_y: int
    authority: float
    entropy_utility: float

    def quantized(self, bins: int = 8) -> tuple[int, int, int, int]:
        if bins < 2:
            raise ValueError("bins must be >=2")
        def q(x: float) -> int:
            x = max(0.0, min(1.0, float(x)))
            return min(bins - 1, int(x * bins))
        return self.som_x, self.som_y, q(self.authority), q(self.entropy_utility)
