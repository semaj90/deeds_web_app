from __future__ import annotations

from typing import Literal

from pydantic import Field

from .structural_observation_v1 import StrictModel


ATLAS_FSM_STOP_SENTINEL = "\0"


class RfcDomainRouteV1(StrictModel):
    rfc_id: str = Field(min_length=1)
    domain_topic: str = Field(min_length=1)
    concept_id: str = Field(min_length=1)
    feature_id: str = Field(min_length=1)
    feature_label: str = Field(min_length=1)
    trigger_phrases: tuple[str, ...] = Field(min_length=1)


class FsmDetectResultV1(StrictModel):
    schema_id: Literal["atlas.fsm-detect-result.v1"] = Field(
        default="atlas.fsm-detect-result.v1", alias="schema", serialization_alias="schema"
    )
    matched: bool
    route: RfcDomainRouteV1 | None
    byte_offset: int | None
    stop_byte_offset: int
    status: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"


def fsm_detect_with_insert_stop(
    text: str,
    routes: tuple[RfcDomainRouteV1, ...] | list[RfcDomainRouteV1],
    *,
    sentinel: str = ATLAS_FSM_STOP_SENTINEL,
) -> FsmDetectResultV1:
    if sentinel != ATLAS_FSM_STOP_SENTINEL:
        raise ValueError("FSM_SENTINEL_MUST_BE_NUL")
    raw = text.encode("utf-8")
    stop_offset = raw.find(b"\0")
    bounded = raw if stop_offset < 0 else raw[:stop_offset]
    text_bytes = bounded.lower()
    matches: list[tuple[int, int, str, RfcDomainRouteV1]] = []
    detect_at = text_bytes.find(b"detect")
    if detect_at >= 0:
        for route in routes:
            for phrase in route.trigger_phrases:
                needle = phrase.encode("utf-8").lower()
                offset = text_bytes.find(needle)
                if offset >= detect_at and offset >= 0:
                    matches.append((offset, -len(needle), route.rfc_id, route))
    if not matches:
        return FsmDetectResultV1(matched=False, route=None, byte_offset=None, stop_byte_offset=len(bounded))
    offset, _, _, route = min(matches)
    return FsmDetectResultV1(matched=True, route=route, byte_offset=offset, stop_byte_offset=len(bounded))


def route_query_or_chunk_on_detect(text: str, routes: tuple[RfcDomainRouteV1, ...] | list[RfcDomainRouteV1]) -> FsmDetectResultV1:
    return fsm_detect_with_insert_stop(text, routes)
