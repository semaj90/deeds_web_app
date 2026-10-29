"""Strict Pydantic boundary for the proposal-only repository capability OKF profile."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from parent_atlas_ontology.okf_yaml_schema_validation_v1 import parse_yaml_document


class FunctionRecommendationV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: Literal[
        "source_inventory",
        "structural_facts",
        "semantic_resolution",
        "byog_graph",
        "scale_projection",
        "proposal_orchestration",
        "offline_analysis",
        "serialization_and_validation",
    ]
    functions: list[str] = Field(min_length=1)
    best_for: str = Field(min_length=1)
    why: str = Field(min_length=1)
    limitation: str = Field(min_length=1)
    source: str | list[str] | None = None

    _allowed_functions: ClassVar[frozenset[str]] = frozenset({
        "rg --files", "package-manifest-and-lockfile-parsers",
        "8095 Tree-sitter CST/AST", "extractSymbolsViaAstGrep",
        "ts-morph semantic enrichment",
        "run_bfs_neighborhood", "run_personalized_pagerank", "run_pagerank_v2",
        "cuGraph executor", "Neo4j projection", "LangChain Deep Agents",
        "Google Agent Development Kit", "DuckDB", "PyArrow", "cuDF", "cuML",
        "PyTorch", "Pydantic", "msgpack",
    })

    @model_validator(mode="after")
    def reject_unknown_functions(self) -> "FunctionRecommendationV1":
        unknown = sorted(set(self.functions) - self._allowed_functions)
        if unknown:
            raise ValueError(f"unsupported function or tool recommendation: {unknown}")
        return self


class RepositoryCapabilityProfileV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    version: Literal[1]
    domain_id: Literal["atlas.repository-capability-classification"]
    name: str = Field(min_length=1)
    status: Literal["proposal_profile"]
    owner: str = Field(min_length=1)
    canonical_authority: Literal[False]
    purpose: str = Field(min_length=1)
    classification: dict[str, Any]
    source_lanes: dict[str, Any]
    recommended_tool_fit: dict[str, Any]
    function_catalog: list[FunctionRecommendationV1] = Field(min_length=1)
    output_contract: dict[str, Any]
    evaluation: dict[str, Any]

    @model_validator(mode="after")
    def enforce_non_authoritative_contract(self) -> "RepositoryCapabilityProfileV1":
        classification = self.classification
        if classification.get("mode") != "deterministic_evidence_first":
            raise ValueError("classification must be deterministic-first")
        if classification.get("output_status") != "PROPOSAL_ONLY":
            raise ValueError("classification output must remain proposal-only")
        if classification.get("abstain_on_ambiguous_or_conflicting_evidence") is not True:
            raise ValueError("ambiguous or conflicting evidence must abstain")
        if not classification.get("required_source_binding"):
            raise ValueError("source and producer revision bindings are required")
        if classification.get("evidence_precedence") != [
            "exact_source_revision_and_resolved_symbol_identity",
            "tree_sitter_structure_and_source_spans",
            "ast_grep_structural_matches",
            "verified_api_route_and_drizzle_relationships",
            "document_semantics_with_attributable_spans",
            "graph_neighborhood_or_embedding_recommendations",
            "directory_paths_and_basenames",
        ]:
            raise ValueError("evidence precedence must keep verified identity above derived hints")
        recommendation_precedence = classification.get("recommendation_evidence_precedence", [])
        if not recommendation_precedence or recommendation_precedence[0] != "revision_bound_implementation_call_site":
            raise ValueError("tool recommendations must start from revision-bound implementation evidence")
        known_dimensions = {
            "application_surface", "data_and_storage", "retrieval_and_search",
            "language_and_static_analysis", "graph_and_relationships",
            "model_and_agent_orchestration", "gpu_and_native_compute",
            "testing_and_operations",
        }
        dimensions = classification.get("capability_dimensions", [])
        if not dimensions or set(dimensions) - known_dimensions:
            raise ValueError("unsupported or empty capability dimensions")

        graph = self.source_lanes.get("graph", {})
        limits = graph.get("limits", {})
        if limits.get("similarity_alone_is_not_a_relationship") is not True:
            raise ValueError("similarity alone cannot create graph relationships")
        if limits.get("max_hops", 0) > 2 or limits.get("max_fanout", 0) > 20:
            raise ValueError("graph traversal exceeds the bounded profile")

        agents = self.source_lanes.get("agents", {}).get("deep_agents", {})
        if agents.get("default_enabled") is not False or agents.get("model_output_is_authority") is not False:
            raise ValueError("Deep Agents must remain optional and non-authoritative")
        adk = self.source_lanes.get("agents", {}).get("google_adk", {})
        if adk.get("default_enabled") is not False or adk.get("model_output_is_authority") is not False or adk.get("canonical_authority") is not False:
            raise ValueError("Google ADK must remain optional and non-authoritative")
        allowed_adk_primitives = {"LlmAgent", "SequentialAgent", "ParallelAgent", "LoopAgent", "FunctionTool", "AgentTool"}
        if set(adk.get("primitives", [])) - allowed_adk_primitives:
            raise ValueError("unsupported Google ADK primitive")

        output = self.output_contract
        if output.get("canonical_feature_label_write") is not False or output.get("persistence") != "none":
            raise ValueError("profile must not authorize persistence or feature-label writes")
        if output.get("feature_label_owner") != "feature-label-semantic-derivation":
            raise ValueError("feature-label derivation must use its existing owner")
        required_dimensions = {"feature_label_proposal", "domain_class_proposal", "source_scope"}
        if required_dimensions - set(output.get("required_fields", [])):
            raise ValueError("proposal must separate feature label, domain class, and source scope")
        if set(output.get("source_scope_values", [])) != {
            "first_party", "vendored", "generated", "documentation", "test", "unknown"
        }:
            raise ValueError("source-scope vocabulary is unsupported or incomplete")
        catalog_ids = [item.id for item in self.function_catalog]
        if len(catalog_ids) != len(set(catalog_ids)):
            raise ValueError("function recommendation ids must be unique")
        if self.source_lanes.get("agents", {}).get("deep_agents", {}).get("not_google_adk") is not True:
            raise ValueError("Deep Agents must be distinguished from Google ADK")
        return self


def validate_profile(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        parsed = parse_yaml_document(raw)
        profile = RepositoryCapabilityProfileV1.model_validate(parsed)
    except Exception as exc:  # validation boundary returns a stable receipt
        return {
            "schema": "atlas.repository-capability-profile-validation.v1",
            "status": "REJECTED",
            "reason": str(exc),
            "documentSha256": digest,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
    return {
        "schema": "atlas.repository-capability-profile-validation.v1",
        "status": "VALID",
        "domainId": profile.domain_id,
        "documentSha256": digest,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
