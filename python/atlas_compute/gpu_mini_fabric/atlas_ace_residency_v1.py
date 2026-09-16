"""AtlasAceResidencyV1 -- BITFROST-SIM-01 hot/warm/cold residency simulation.

Named `Atlas`-prefixed (never a bare `Ace*`) per root CLAUDE.md's NVIDIA-ACE
naming-collision rule.

Pure logic, no CUDA, no GPU device access, no canonical production data --
runs the query-sequence trace from query_sequence_fixture.py through a
two-tier (HOT/WARM, COLD implicit) cache simulation with graph-neighbor
prefetch promotion, reporting the full required metric set:
hitRate, precisionOfPrefetch, bytesPromoted, bytesWasted, promotionLatency,
evictionRate, queryLatencyDelta.

Eviction mode is config-selectable (`utility-score` primary, `lru` baseline)
through the SAME harness -- design.md Decision 3 -- so a future SOM-CACHE-01
tournament can add a third strategy without rebuilding this harness.

LOD-rung promotion (AtlasLodLadderV1) is triggered by the same
graph-neighbor-promotion event as WARM residency promotion, but its state is
validated independently (atlas-lod-promotion-ladder spec).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal

from atlas_compute.gpu_mini_fabric.atlas_lod_ladder_v1 import AtlasLodLadderV1, LOD_BYTE_SIZES

EvictionMode = Literal["utility-score", "lru"]

HOT_CAPACITY = 100
WARM_CAPACITY = 500

LATENCY_HOT = 1.0
LATENCY_WARM = 5.0
LATENCY_COLD = 20.0
PROMOTION_LATENCY_COST = 2.0

# Recency decay applied per simulation step since a node was last touched
# (real query hit OR neighbor-promotion "soft touch"). < 1 so utility fades
# with time -- without this, a purely-frequency score could never demote a
# once-popular node even after the query pattern moves on (design.md
# Decision 3, rejected-alternative rationale).
RECENCY_DECAY = 0.98

# CALLS/IMPORTS weighted higher than TESTS -- fixed, documented, not learned.
EDGE_TYPE_WEIGHT: dict[str, float] = {
    "CALLS": 1.0,
    "IMPORTS": 1.0,
    "REFERENCES": 0.6,
    "IMPLEMENTS": 0.6,
    "TESTS": 0.3,
    # SOM-CACHE-01: SOM-BMU-neighbor promotions carry their own fixed weight,
    # never silently falling back to TESTS' weight via a missing-key default.
    "SOM_NEIGHBOR": 0.5,
}

NeighborProvider = Callable[[str], list[tuple[str, str]]]

Tier = Literal["HOT", "WARM"]


@dataclass
class _NodeState:
    tier: Tier | None = None
    visit_count: float = 0.0
    last_touched_step: int = -1
    real_hit_since_entry: bool = False


@dataclass
class AtlasAceResidencyResultV1:
    eviction_mode: EvictionMode
    total_queries: int
    hit_rate: float
    precision_of_prefetch: float
    bytes_promoted: int
    bytes_wasted: int
    promotion_latency_avg: float
    eviction_rate: float
    query_latency_delta_avg: float
    lod_byte_size_table: dict[str, int]

    def to_dict(self) -> dict:
        return {
            "eviction_mode": self.eviction_mode,
            "total_queries": self.total_queries,
            "hitRate": self.hit_rate,
            "precisionOfPrefetch": self.precision_of_prefetch,
            "bytesPromoted": self.bytes_promoted,
            "bytesWasted": self.bytes_wasted,
            "promotionLatency": self.promotion_latency_avg,
            "evictionRate": self.eviction_rate,
            "queryLatencyDelta": self.query_latency_delta_avg,
            "lod_byte_size_table": self.lod_byte_size_table,
        }


class AtlasAceResidencyV1:
    def __init__(
        self,
        adjacency_with_types: dict[str, list[tuple[str, str]]],
        eviction_mode: EvictionMode = "utility-score",
        neighbor_provider: NeighborProvider | None = None,
    ) -> None:
        """neighbor_provider (SOM-CACHE-01 addition): optional pluggable
        neighbor-selection strategy, node_key -> list[(neighbor_key,
        edge_type_label)]. Defaults to None, which preserves the ORIGINAL
        graph-adjacency-only behavior byte-for-byte
        (self.adjacency_with_types.get(node_key, [])) -- existing callers
        (parent-atlas-bitfrost-sim-01's bitfrost_sim_01.py) that don't pass
        this parameter are unaffected. A caller may pass `lambda _: []` for a
        no-prefetch strategy, or a trained AtlasStructuralSomV1's
        `som_bmu_neighbors` method for the SOM-BMU-neighbor strategy -- all
        run through this same promotion/eviction/LOD-ladder code path."""
        self.adjacency_with_types = adjacency_with_types
        self.eviction_mode = eviction_mode
        self.neighbor_provider = neighbor_provider
        self.states: dict[str, _NodeState] = {}
        self.hot: set[str] = set()
        self.warm: set[str] = set()
        self.ladder = AtlasLodLadderV1()

        self.total_evictions = 0
        self.total_promotions_latency_units = 0.0
        self.total_latency_delta = 0.0
        self.total_hits = 0
        self.bytes_promoted = 0
        self.bytes_wasted = 0
        self._prefetch_opportunities = 0
        self._prefetch_hits = 0
        self._pending_promoted_neighbors: set[str] = set()

    def _state(self, node_key: str) -> _NodeState:
        st = self.states.get(node_key)
        if st is None:
            st = _NodeState()
            self.states[node_key] = st
        return st

    def _utility(self, node_key: str, step: int) -> float:
        st = self._state(node_key)
        if self.eviction_mode == "lru":
            # LRU baseline: utility IS recency alone (older last-touch = lower).
            return float(st.last_touched_step)
        age = step - st.last_touched_step
        return st.visit_count * (RECENCY_DECAY ** max(age, 0))

    def _evict_lowest_utility(self, tier_set: set[str], step: int) -> str | None:
        if not tier_set:
            return None
        # Tie-break on node_key (deterministic) as the secondary sort key --
        # set[str] iteration order in CPython depends on per-process string
        # hash randomization (PYTHONHASHSEED), so min() over a plain set with
        # a utility-only key produces a non-deterministic victim whenever two
        # nodes tie on utility. Verified live: two runs of the same seeded
        # trace produced different observed_lift values (0.534 vs 0.53425)
        # until this fix.
        victim = min(tier_set, key=lambda k: (self._utility(k, step), k))
        return victim

    def _remove_from_tiers(self, node_key: str, step: int) -> None:
        st = self._state(node_key)
        was_resident = node_key in self.hot or node_key in self.warm
        self.hot.discard(node_key)
        self.warm.discard(node_key)
        if was_resident:
            self.total_evictions += 1
            if not st.real_hit_since_entry:
                self.bytes_wasted += self.ladder.byte_size_of(node_key)
            # Demote LOD rung on full eviction to COLD -- materialized detail
            # shrinks when a candidate falls out of residency, mirroring the
            # promotion that happened on the way in. Fixes a real gap found
            # 2026-09-14: this was the only tier-removal path in the harness,
            # and it never demoted the ladder before this fix.
            self.ladder.demote_one_rung(node_key)
        st.tier = None
        st.real_hit_since_entry = False

    def _insert_hot(self, node_key: str, step: int) -> None:
        self.warm.discard(node_key)
        if node_key not in self.hot and len(self.hot) >= HOT_CAPACITY:
            victim = self._evict_lowest_utility(self.hot, step)
            if victim is not None:
                self.hot.discard(victim)
                # Demote victim into WARM rather than a full eviction, if
                # there is room -- otherwise WARM's own insert logic evicts
                # its lowest-utility member to make room, which is where the
                # eviction (and possible bytesWasted) actually gets counted.
                self._insert_warm(victim, step)
        self.hot.add(node_key)
        self._state(node_key).tier = "HOT"

    def _insert_warm(self, node_key: str, step: int) -> None:
        if node_key in self.hot:
            return
        if node_key not in self.warm and len(self.warm) >= WARM_CAPACITY:
            victim = self._evict_lowest_utility(self.warm, step)
            if victim is not None:
                # _remove_from_tiers() checks tier membership itself to decide
                # whether to count the eviction/bytesWasted -- do NOT discard
                # from self.warm here first, or it always sees the victim as
                # already gone and silently skips counting it (the bug this
                # comment replaces).
                self._remove_from_tiers(victim, step)
        self.warm.add(node_key)
        self._state(node_key).tier = "WARM"

    def run(self, trace: list[str]) -> AtlasAceResidencyResultV1:
        for step, node_key in enumerate(trace):
            # --- Prefetch precision bookkeeping (from the PRIOR step's promotions) ---
            if self._pending_promoted_neighbors:
                self._prefetch_opportunities += 1
                if node_key in self._pending_promoted_neighbors:
                    self._prefetch_hits += 1
            self._pending_promoted_neighbors = set()

            # --- Hit/miss + latency accounting ---
            st = self._state(node_key)
            if node_key in self.hot:
                latency = LATENCY_HOT
                self.total_hits += 1
            elif node_key in self.warm:
                latency = LATENCY_WARM
                self.total_hits += 1
            else:
                latency = LATENCY_COLD
            self.total_latency_delta += LATENCY_COLD - latency

            st.visit_count += 1.0
            st.last_touched_step = step
            st.real_hit_since_entry = True

            # --- Promote the queried node itself toward HOT ---
            self._insert_hot(node_key, step)
            self.ladder.promote_one_rung(node_key)

            # --- Promote strategy-selected neighbors to WARM (the "prefetch") ---
            if self.neighbor_provider is not None:
                neighbors = self.neighbor_provider(node_key)
            else:
                neighbors = self.adjacency_with_types.get(node_key, [])
            promoted_this_step: set[str] = set()
            for neighbor_key, edge_type in neighbors:
                if neighbor_key in self.hot:
                    continue  # already better than WARM, nothing to do
                weight = EDGE_TYPE_WEIGHT.get(edge_type, 0.3)
                n_st = self._state(neighbor_key)
                already_warm = neighbor_key in self.warm
                n_st.visit_count += weight
                n_st.last_touched_step = step
                if not already_warm:
                    n_st.real_hit_since_entry = False
                before_rung = self.ladder.rung_of(neighbor_key)
                self._insert_warm(neighbor_key, step)
                event = self.ladder.promote_one_rung(neighbor_key)
                if event.to_rung != before_rung:
                    self.bytes_promoted += self.ladder.byte_size_of(neighbor_key)
                self.total_promotions_latency_units += PROMOTION_LATENCY_COST
                promoted_this_step.add(neighbor_key)

            self._pending_promoted_neighbors = promoted_this_step

        total = len(trace)
        return AtlasAceResidencyResultV1(
            eviction_mode=self.eviction_mode,
            total_queries=total,
            hit_rate=self.total_hits / total if total else 0.0,
            precision_of_prefetch=(
                self._prefetch_hits / self._prefetch_opportunities
                if self._prefetch_opportunities
                else 0.0
            ),
            bytes_promoted=self.bytes_promoted,
            bytes_wasted=self.bytes_wasted,
            promotion_latency_avg=self.total_promotions_latency_units / total if total else 0.0,
            eviction_rate=self.total_evictions / total if total else 0.0,
            query_latency_delta_avg=self.total_latency_delta / total if total else 0.0,
            lod_byte_size_table=dict(LOD_BYTE_SIZES),
        )
