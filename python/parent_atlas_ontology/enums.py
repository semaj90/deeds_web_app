"""Enum value sets copied verbatim from the REAL TS schema at
sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts
(z.enum([...]) literals, lines 6-72 as of 2026-08-31) — not invented, not
approximated. If the TS schema's enums ever change, this file drifts and
must be re-synced by hand; there is no shared source-of-truth file both
languages read from (a real, acknowledged limitation of a two-language
contract with no codegen step between them yet).
"""

from __future__ import annotations

EVIDENCE_STATE_VALUES = frozenset({
    "ACTIVE_VERIFIED", "ACTIVE_DEGRADED", "GATED", "REFERENCE_ONLY", "SUPERSEDED", "FAILED",
})

LABEL_KIND_VALUES = frozenset({"pos", "tag", "ontology"})

LABEL_SOURCE_VALUES = frozenset({"pos_tagger", "semantic_tagger", "regex", "ner", "llm", "manual"})

PARTICIPANT_ROLE_VALUES = frozenset({
    "actor", "target", "input", "output", "tool", "packet", "symbol", "task", "workflow",
    "evidence", "cause", "effect", "citation", "screenshot", "summary", "policy", "source",
    "topology", "manifold", "context",
})

PARTICIPANT_KIND_VALUES = frozenset({
    "packet", "source_ref", "tree_node", "ast_symbol", "semantic_concept", "concept", "topic",
    "citation", "screenshot", "policy_summary", "tool_call", "topology_node", "manifold_point",
    "page_rank", "bm25", "bm42", "mcp_tool_call", "summary",
})

LIFECYCLE_VALUES = frozenset({"OBSERVED", "DERIVED", "SUPERSEDED"})

MAX_ONTOLOGY_IDS = 32
MAX_CONCEPT_IDS = 32
MAX_PARTICIPANTS = 16
MAX_EVIDENCE_REFS = 32
MAX_SOURCE_TABLES = 12
