from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from parent_atlas_ontology.repository_capability_profile_v1 import (
    RepositoryCapabilityProfileV1,
    validate_profile,
)
from parent_atlas_ontology.okf_yaml_schema_validation_v1 import parse_yaml_document


ROOT = Path(__file__).resolve().parents[2]
PROFILE = ROOT / ".okf/domains/repository-capability-classification-v1.yaml"


def test_repository_capability_profile_validates_as_noncanonical() -> None:
    receipt = validate_profile(PROFILE)

    assert receipt["status"] == "VALID"
    assert receipt["canonicalAuthority"] is False
    assert receipt["writesPerformed"] is False


def test_profile_rejects_authority_or_unbounded_graph_policy() -> None:
    document = parse_yaml_document(PROFILE.read_bytes())
    document["canonical_authority"] = True
    with pytest.raises(ValidationError):
        RepositoryCapabilityProfileV1.model_validate(document)

    document = parse_yaml_document(PROFILE.read_bytes())
    document["source_lanes"]["graph"]["limits"]["max_fanout"] = 21
    with pytest.raises(ValidationError, match="bounded profile"):
        RepositoryCapabilityProfileV1.model_validate(document)


def test_function_catalog_names_existing_owners_and_distinguishes_agent_ecosystems() -> None:
    profile = RepositoryCapabilityProfileV1.model_validate(parse_yaml_document(PROFILE.read_bytes()))

    recommendations = {item.id: item for item in profile.function_catalog}
    assert "extractSymbolsViaAstGrep" in recommendations["structural_facts"].functions
    assert "run_bfs_neighborhood" in recommendations["byog_graph"].functions
    assert profile.source_lanes["agents"]["deep_agents"]["not_google_adk"] is True
    assert profile.source_lanes["agents"]["google_adk"]["default_enabled"] is False
    assert {"feature_label_proposal", "domain_class_proposal", "source_scope"}.issubset(
        profile.output_contract["required_fields"]
    )


def test_profile_rejects_unknown_tools_unsupported_dimensions_and_missing_source_scope() -> None:
    document = parse_yaml_document(PROFILE.read_bytes())
    document["function_catalog"][0]["functions"].append("unreviewed-agent-framework")
    with pytest.raises(ValidationError, match="unsupported function or tool"):
        RepositoryCapabilityProfileV1.model_validate(document)

    document = parse_yaml_document(PROFILE.read_bytes())
    document["classification"]["capability_dimensions"].append("invented_capability")
    with pytest.raises(ValidationError, match="unsupported or empty capability dimensions"):
        RepositoryCapabilityProfileV1.model_validate(document)

    document = parse_yaml_document(PROFILE.read_bytes())
    document["output_contract"]["required_fields"].remove("source_scope")
    with pytest.raises(ValidationError, match="source scope"):
        RepositoryCapabilityProfileV1.model_validate(document)


def test_profile_rejects_unknown_adk_primitives() -> None:
    document = parse_yaml_document(PROFILE.read_bytes())
    document["source_lanes"]["agents"]["google_adk"]["primitives"].append("UnreviewedAgent")
    with pytest.raises(ValidationError, match="unsupported Google ADK primitive"):
        RepositoryCapabilityProfileV1.model_validate(document)


def test_profile_rejects_empty_recommendation_evidence_precedence() -> None:
    document = parse_yaml_document(PROFILE.read_bytes())
    document["classification"]["recommendation_evidence_precedence"] = []
    with pytest.raises(ValidationError, match="tool recommendations"):
        RepositoryCapabilityProfileV1.model_validate(document)
