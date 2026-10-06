from __future__ import annotations

from python.atlas_okf_topic_extractor import (
    DEFAULT_CONTEXT_ENGINEERING_TOPICS_V1,
    TopicProfileV1,
    extract_topic_observations_v1,
    summarize_topic_counts_v1,
)


def test_extracts_exact_char_and_utf8_byte_spans() -> None:
    text = "Mastra routes tools. Viterbi decodes HMM paths. Valkey caches → Arrow IPC."
    rows = extract_topic_observations_v1(
        source_id="fixture",
        source_revision="source:v1",
        page_ref="fixture://page",
        normalized_text=text,
    )
    assert rows
    encoded = text.encode("utf-8")
    for row in rows:
        assert text[row.start_char:row.end_char] == row.surface
        assert encoded[row.start_byte:row.end_byte].decode("utf-8") == row.surface
        assert row.canonical_authority is False


def test_preserves_manifest_domain_hint_as_unreviewed_metadata() -> None:
    profile = TopicProfileV1("custom", "routing_policy", ("viterbi",))
    [row] = extract_topic_observations_v1(
        source_id="fixture",
        source_revision="source:v1",
        page_ref="fixture://page",
        normalized_text="Viterbi",
        profiles=(profile,),
    )
    assert row.domain_hint == "routing_policy"
    assert row.authority_class == "EXTERNAL_REFERENCE"


def test_is_deterministic_and_bounded_per_topic() -> None:
    rows = extract_topic_observations_v1(
        source_id="fixture",
        source_revision="source:v1",
        page_ref="fixture://page",
        normalized_text="Valkey Valkey Valkey",
        max_observations_per_topic=2,
    )
    valkey = [row for row in rows if row.topic_id == "redis-valkey"]
    assert len(valkey) == 2
    assert summarize_topic_counts_v1(rows)["redis-valkey"] == 2


def test_default_profile_inventory_covers_requested_topics() -> None:
    ids = {profile.topic_id for profile in DEFAULT_CONTEXT_ENGINEERING_TOPICS_V1}
    assert {"mastra", "mcp", "viterbi-hmm", "dspy-gepa", "bitfrost", "redis-valkey", "grpc-protobuf", "duckdb", "gpu-rtx"} <= ids
