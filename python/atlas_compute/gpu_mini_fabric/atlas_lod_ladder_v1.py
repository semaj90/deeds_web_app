"""AtlasLodLadderV1 -- strict identity-to-prompt-ready LOD promotion/demotion ladder.

Named `Atlas`-prefixed (never a bare `Ace*`) per root CLAUDE.md's NVIDIA-ACE
naming-collision rule (NVIDIA's cuVS HNSW-build "ACE" = Augmented Core
Extraction, unrelated to this repo's Atlas ACE context/residency system).

Independent of AtlasAceResidencyV1's HOT/WARM/COLD tier state -- a candidate's
LOD rung ("how much detail is materialized") and its residency tier ("how
likely it is to survive to the next query") are two separate axes, validated
separately so a defect in one is never masked by the other
(atlas-lod-promotion-ladder spec, "validated independently" requirement).
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Strict order: identity -> ... -> prompt-ready. Index in this list IS the rung.
LOD_RUNGS: list[str] = [
    "identity",
    "glyph",
    "latent64",
    "latent128",
    "semantic768",
    "structural",
    "source",
    "prompt_ready",
]

# Nominal, documented (NOT measured against real production packets) per-rung
# byte-size table -- design.md Decision 4. identity ~32B (a packet_key-shaped
# hash), glyph ~16B (root CLAUDE.md's PacketGlyphV1 packed-struct size),
# latent64/128 = dim*4B fp32, semantic768 = 768*4B fp32, structural/source/
# prompt_ready are larger fixed placeholders for progressively fuller
# materialization.
LOD_BYTE_SIZES: dict[str, int] = {
    "identity": 32,
    "glyph": 16,
    "latent64": 256,
    "latent128": 512,
    "semantic768": 3072,
    "structural": 8192,
    "source": 16384,
    "prompt_ready": 32768,
}

RUNG_INDEX: dict[str, int] = {name: i for i, name in enumerate(LOD_RUNGS)}
MAX_RUNG_INDEX = len(LOD_RUNGS) - 1


@dataclass
class LodTransitionEventV1:
    node_key: str
    from_rung: str
    to_rung: str
    accepted: bool
    skipped_rungs: int
    override_reason: str | None


@dataclass
class AtlasLodLadderV1:
    """Per-node current LOD rung tracker with strict adjacent-only transition
    validation. Rungs default to `identity` (index 0) for any node not yet
    seen."""

    current_rung_index: dict[str, int] = field(default_factory=dict)
    events: list[LodTransitionEventV1] = field(default_factory=list)

    def rung_of(self, node_key: str) -> str:
        return LOD_RUNGS[self.current_rung_index.get(node_key, 0)]

    def byte_size_of(self, node_key: str) -> int:
        return LOD_BYTE_SIZES[self.rung_of(node_key)]

    def promote_one_rung(self, node_key: str) -> LodTransitionEventV1:
        """Promote node_key exactly one rung up (the only sanctioned normal
        transition). No-ops (accepted, zero-cost) if already at max rung."""
        current_index = self.current_rung_index.get(node_key, 0)
        if current_index >= MAX_RUNG_INDEX:
            event = LodTransitionEventV1(
                node_key=node_key,
                from_rung=LOD_RUNGS[current_index],
                to_rung=LOD_RUNGS[current_index],
                accepted=True,
                skipped_rungs=0,
                override_reason=None,
            )
            self.events.append(event)
            return event
        new_index = current_index + 1
        self.current_rung_index[node_key] = new_index
        event = LodTransitionEventV1(
            node_key=node_key,
            from_rung=LOD_RUNGS[current_index],
            to_rung=LOD_RUNGS[new_index],
            accepted=True,
            skipped_rungs=0,
            override_reason=None,
        )
        self.events.append(event)
        return event

    def demote_one_rung(self, node_key: str) -> LodTransitionEventV1:
        """Demote node_key exactly one rung down (the only sanctioned normal
        demotion transition, mirroring promote_one_rung()). No-ops (accepted,
        zero-cost) if already at identity (rung 0).

        Added 2026-09-14 (post-archive gap review): AtlasAceResidencyV1
        previously only ever called promote_one_rung() -- a node's LOD rung
        would grow monotonically for as long as it kept being queried or
        promoted as a neighbor, but nothing ever shrank it back down even
        after full eviction to COLD. The atlas-lod-promotion-ladder spec's
        own name is "promotion AND demotion" -- this closes that gap."""
        current_index = self.current_rung_index.get(node_key, 0)
        if current_index <= 0:
            event = LodTransitionEventV1(
                node_key=node_key,
                from_rung=LOD_RUNGS[current_index],
                to_rung=LOD_RUNGS[current_index],
                accepted=True,
                skipped_rungs=0,
                override_reason=None,
            )
            self.events.append(event)
            return event
        new_index = current_index - 1
        self.current_rung_index[node_key] = new_index
        event = LodTransitionEventV1(
            node_key=node_key,
            from_rung=LOD_RUNGS[current_index],
            to_rung=LOD_RUNGS[new_index],
            accepted=True,
            skipped_rungs=0,
            override_reason=None,
        )
        self.events.append(event)
        return event

    def request_transition(
        self, node_key: str, to_rung: str, override_reason: str | None = None
    ) -> LodTransitionEventV1:
        """Explicit-target transition request. A skip (more than one rung of
        difference) is REJECTED unless override_reason is provided, in which
        case it is ACCEPTED but logged with the override reason -- per
        atlas-lod-promotion-ladder spec's "reject or log" requirement."""
        current_index = self.current_rung_index.get(node_key, 0)
        target_index = RUNG_INDEX[to_rung]
        skipped = abs(target_index - current_index) - 1
        skipped = max(skipped, 0)

        if skipped > 0 and override_reason is None:
            event = LodTransitionEventV1(
                node_key=node_key,
                from_rung=LOD_RUNGS[current_index],
                to_rung=LOD_RUNGS[current_index],  # rejected: rung unchanged
                accepted=False,
                skipped_rungs=skipped,
                override_reason=None,
            )
            self.events.append(event)
            return event

        self.current_rung_index[node_key] = target_index
        event = LodTransitionEventV1(
            node_key=node_key,
            from_rung=LOD_RUNGS[current_index],
            to_rung=LOD_RUNGS[target_index],
            accepted=True,
            skipped_rungs=skipped,
            override_reason=override_reason if skipped > 0 else None,
        )
        self.events.append(event)
        return event
