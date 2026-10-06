from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Iterable, Sequence


@dataclass(frozen=True)
class TopicProfileV1:
    topic_id: str
    domain_hint: str
    terms: tuple[str, ...]
    phrases: tuple[str, ...] = ()
    authority_class: str = "EXTERNAL_REFERENCE"


@dataclass(frozen=True)
class TopicObservationV1:
    schema: str
    source_id: str
    source_revision: str
    workspace_revision: str
    producer_revision: str
    page_ref: str
    topic_id: str
    domain_hint: str
    authority_class: str
    surface: str
    start_char: int
    end_char: int
    start_byte: int
    end_byte: int
    content_checksum: str
    evidence_checksum: str
    canonical_authority: bool


DEFAULT_CONTEXT_ENGINEERING_TOPICS_V1: tuple[TopicProfileV1, ...] = (
    TopicProfileV1("mastra", "agent_orchestration", ("mastra",), ("workflow graph", "agent workflow")),
    TopicProfileV1("mcp", "agent_orchestration", ("mcp", "tool"), ("model context protocol", "tool registry")),
    TopicProfileV1("viterbi-hmm", "routing_policy", ("viterbi", "hmm"), ("hidden markov model", "dynamic programming")),
    TopicProfileV1("dspy-gepa", "optimizer", ("dspy", "gepa"), ("prompt optimizer", "textual feedback")),
    TopicProfileV1("ace-packets", "context_engineering", ("ace", "packet"), ("context manifest", "context packet")),
    TopicProfileV1("bitfrost", "cache_residency", ("bitfrost",), ("hot warm cold", "residency policy")),
    TopicProfileV1("redis-valkey", "cache_residency", ("redis", "valkey"), ("client-side caching",)),
    TopicProfileV1("messagepack-bitpacking", "serialization", ("messagepack", "msgpack", "bitset", "bitpack"), ("binary encoding",)),
    TopicProfileV1("grpc-protobuf", "transport", ("grpc", "protobuf"), ("protocol buffers",)),
    TopicProfileV1("duckdb", "offline_analytics", ("duckdb",), ("json extension",)),
    TopicProfileV1("arrow-mmap", "numeric_transport", ("arrow", "mmap"), ("arrow ipc", "memory mapped")),
    TopicProfileV1("fastapi", "compute_executor", ("fastapi",), ("pydantic",)),
    TopicProfileV1("gpu-rtx", "compute_executor", ("cuda", "rtx", "cuvs", "cugraph", "cublaslt"), ("gpu executor",)),
    TopicProfileV1("hypergraph-rag", "retrieval_graph", ("hypergraph", "rag"), ("multi-hop", "multihop")),
    TopicProfileV1("ontology-oak", "ontology", ("oaklib", "ontology"), ("ontology access kit",)),
)


def _sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _byte_offset(text: str, char_offset: int) -> int:
    return len(text[:char_offset].encode("utf-8"))


def _patterns(profile: TopicProfileV1) -> list[str]:
    values = [*profile.phrases, *profile.terms]
    # Longest first so multi-word phrases win over component terms.
    return sorted({value.strip() for value in values if value.strip()}, key=lambda value: (-len(value), value.lower()))


def extract_topic_observations_v1(
    *,
    source_id: str,
    source_revision: str,
    workspace_revision: str,
    producer_revision: str,
    page_ref: str,
    normalized_text: str,
    profiles: Sequence[TopicProfileV1] = DEFAULT_CONTEXT_ENGINEERING_TOPICS_V1,
    max_observations_per_topic: int = 64,
) -> list[TopicObservationV1]:
    if not source_id.strip() or not source_revision.strip() or not workspace_revision.strip() or not producer_revision.strip() or not page_ref.strip():
        raise ValueError("SOURCE_WORKSPACE_PRODUCER_REVISION_AND_PAGE_REQUIRED")
    if max_observations_per_topic < 1:
        raise ValueError("MAX_OBSERVATIONS_PER_TOPIC_MUST_BE_POSITIVE")

    checksum = _sha256_text(normalized_text)
    observations: list[TopicObservationV1] = []

    for profile in profiles:
        seen_spans: set[tuple[int, int]] = set()
        count = 0
        for pattern in _patterns(profile):
            regex = re.compile(rf"(?<!\w){re.escape(pattern)}(?!\w)", re.IGNORECASE)
            for match in regex.finditer(normalized_text):
                span = (match.start(), match.end())
                if span in seen_spans:
                    continue
                seen_spans.add(span)
                surface = normalized_text[match.start():match.end()]
                start_byte = _byte_offset(normalized_text, match.start())
                end_byte = _byte_offset(normalized_text, match.end())
                # Fail closed on coordinate drift.
                encoded = normalized_text.encode("utf-8")
                if encoded[start_byte:end_byte].decode("utf-8") != surface:
                    raise ValueError("UTF8_SPAN_MISMATCH")

                evidence_checksum = _sha256_text(
                    "|".join(
                        [
                            source_id,
                            source_revision,
                            workspace_revision,
                            producer_revision,
                            page_ref,
                            profile.topic_id,
                            str(match.start()),
                            str(match.end()),
                            surface,
                            checksum,
                        ]
                    )
                )

                observations.append(
                    TopicObservationV1(
                        schema="atlas.okf-topic-observation.v1",
                        source_id=source_id,
                        source_revision=source_revision,
                        workspace_revision=workspace_revision,
                        producer_revision=producer_revision,
                        page_ref=page_ref,
                        topic_id=profile.topic_id,
                        domain_hint=profile.domain_hint,
                        authority_class=profile.authority_class,
                        surface=surface,
                        start_char=match.start(),
                        end_char=match.end(),
                        start_byte=start_byte,
                        end_byte=end_byte,
                        content_checksum=checksum,
                        evidence_checksum=evidence_checksum,
                        canonical_authority=False,
                    )
                )
                count += 1
                if count >= max_observations_per_topic:
                    break
            if count >= max_observations_per_topic:
                break

    observations.sort(key=lambda row: (row.start_char, row.end_char, row.topic_id, row.surface.lower()))
    return observations


def summarize_topic_counts_v1(observations: Iterable[TopicObservationV1]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for observation in observations:
        counts[observation.topic_id] = counts.get(observation.topic_id, 0) + 1
    return dict(sorted(counts.items()))
