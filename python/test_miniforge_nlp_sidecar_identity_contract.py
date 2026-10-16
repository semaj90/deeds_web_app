import pytest

import miniforge_nlp_sidecar as sidecar


def test_tree_node_observation_id_is_deterministic_and_revision_scoped() -> None:
    first = sidecar._mint_revision_qualified_tree_node_id(
        "src/example.py", "sha256:" + "a" * 64, "function_definition", "pkg.run", 3, 18
    )
    replay = sidecar._mint_revision_qualified_tree_node_id(
        "src/example.py", "sha256:" + "a" * 64, "function_definition", "pkg.run", 3, 18
    )
    changed_revision = sidecar._mint_revision_qualified_tree_node_id(
        "src/example.py", "sha256:" + "b" * 64, "function_definition", "pkg.run", 3, 18
    )

    assert first == replay
    assert first.startswith("tn_v1_")
    assert len(first) == len("tn_v1_") + 32
    assert first != changed_revision


@pytest.mark.parametrize("revision", ["", "unknown"])
def test_tree_node_observation_id_rejects_unqualified_revision(revision: str) -> None:
    with pytest.raises(ValueError, match="source_revision is required"):
        sidecar._mint_revision_qualified_tree_node_id("src/a.py", revision, "module", "", 0, 1)


def test_utf8_to_utf16_offset_counts_surrogate_pair_and_rejects_mid_codepoint() -> None:
    source = "π🧭x".encode("utf-8")

    assert sidecar.strict_utf8_to_utf16_offset(source, 0) == 0
    assert sidecar.strict_utf8_to_utf16_offset(source, len("π🧭".encode("utf-8"))) == 3
    with pytest.raises(ValueError, match="cuts mid-codepoint"):
        sidecar.strict_utf8_to_utf16_offset(source, 3)
    with pytest.raises(ValueError, match="out of bounds"):
        sidecar.strict_utf8_to_utf16_offset(source, len(source) + 1)


def test_hyperedge_id_is_order_independent_deduplicated_and_revision_scoped() -> None:
    args = ("src/example.svelte", "sha256:" + "a" * 64, "RENDERS_COMPONENT")
    first_id, first_members = sidecar.mint_sorted_hyperedge_id(*args, ["node:c", "node:a", "node:b", "node:a"])
    replay_id, replay_members = sidecar.mint_sorted_hyperedge_id(*args, ["node:b", "node:c", "node:a"])
    changed_revision_id, _ = sidecar.mint_sorted_hyperedge_id(
        args[0], "sha256:" + "b" * 64, args[2], ["node:a", "node:b", "node:c"]
    )

    assert first_id == replay_id
    assert first_members == replay_members == ["node:a", "node:b", "node:c"]
    assert first_id.startswith("he_v1_")
    assert first_id != changed_revision_id


def test_hyperedge_requires_two_distinct_members_and_revision() -> None:
    with pytest.raises(ValueError, match="at least 2 distinct"):
        sidecar.mint_sorted_hyperedge_id("src/a.py", "rev", "CALLS", ["node:a", "node:a"])
    with pytest.raises(ValueError, match="source_revision is required"):
        sidecar.mint_sorted_hyperedge_id("src/a.py", "unknown", "CALLS", ["node:a", "node:b"])
