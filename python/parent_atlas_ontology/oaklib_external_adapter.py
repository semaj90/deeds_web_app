"""OAKLIB-ADAPTER-01: read-only external ontology adapter for Parent Atlas.

This module intentionally does NOT create Parent Atlas canonical identity.
It normalizes an OAK/oaklib ontology source into reviewable concept and
relationship candidates. Canonical concept creation remains owned by
`entity-concept-taxonomy-v1.ts::createConceptV1`; canonical n-ary relation
truth remains owned by `HyperedgeV1` promotion.

The name uses `oaklib` explicitly to avoid collision with this repository's
separate OaK (Ontology-as-a-Kernel) work.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
from itertools import islice
from inspect import Parameter, signature
import math
from typing import Iterable, Protocol, Sequence
import unicodedata


class OakOntologyAdapterProtocol(Protocol):
    """Small verified OAK surface used by Parent Atlas.

    Current oaklib docs guarantee these operations across compatible adapters:
    label, definition, and relationships. Keeping the protocol narrow prevents
    backend-specific methods from becoming Parent Atlas contract requirements.
    """

    def label(self, entity_id: str) -> str | None: ...

    def definition(self, entity_id: str) -> str | None: ...

    def relationships(self, subjects: Sequence[str]) -> Iterable[tuple[str, str, str]]: ...

    def basic_search(self, search_term: str, config: object | None = None) -> Iterable[str]: ...


@dataclass(frozen=True, slots=True)
class OaklibConceptCandidateV1:
    schema: str
    candidateId: str
    externalId: str
    label: str
    description: str | None
    namespace: str
    ontologyRevision: str
    producerRevision: str
    evidenceRefs: tuple[str, ...]
    status: str = "PROPOSED"
    canonicalAuthority: bool = False

    def parent_atlas_concept_input(self) -> dict[str, object]:
        """Return fields expected by createConceptV1 after explicit promotion.

        This does not call createConceptV1 and therefore does not mint a
        Parent Atlas ConceptV1 id.
        """

        return {
            "conceptKey": self.externalId,
            "namespace": self.namespace,
            "label": self.label,
            "aliases": [],
            "description": self.description,
            "taxonomyRevision": self.ontologyRevision,
            "definitionEvidenceRefs": list(self.evidenceRefs),
            "producerRevision": self.producerRevision,
        }


@dataclass(frozen=True, slots=True)
class OaklibRelationCandidateV1:
    schema: str
    candidateId: str
    subjectExternalId: str
    predicateExternalId: str
    objectExternalId: str
    subjectLabel: str
    predicateLabel: str | None
    objectLabel: str
    ontologyRevision: str
    producerRevision: str
    evidenceRefs: tuple[str, ...]
    status: str = "PROPOSED"
    canonicalAuthority: bool = False
    promotionTarget: str = "HyperedgeV1"


@dataclass(frozen=True, slots=True)
class OaklibMappingCandidateV1:
    schema: str
    candidateId: str
    subjectId: str
    predicateId: str
    objectId: str
    mappingJustification: str | None
    subjectSource: str | None
    objectSource: str | None
    subjectSourceVersion: str | None
    objectSourceVersion: str | None
    confidence: float | None
    ontologyRevision: str
    producerRevision: str
    evidenceRefs: tuple[str, ...]
    status: str = "PROPOSED"
    canonicalAuthority: bool = False


@dataclass(frozen=True, slots=True)
class OaklibCandidateBundleV1:
    schema: str
    sourceSelector: str
    ontologyRevision: str
    producerRevision: str
    concepts: tuple[OaklibConceptCandidateV1, ...]
    relations: tuple[OaklibRelationCandidateV1, ...]
    mappingProviderStatus: str
    mappingCandidates: tuple[OaklibMappingCandidateV1, ...]
    canonicalAuthority: bool = False

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _stable_id(prefix: str, *parts: str) -> str:
    digest = sha256("\0".join(parts).encode("utf-8")).hexdigest()[:32]
    return f"{prefix}:{digest}"


def _safe_label(adapter: OakOntologyAdapterProtocol, entity_id: str) -> str:
    value = adapter.label(entity_id)
    return value.strip() if value and value.strip() else entity_id


def _safe_definition(adapter: OakOntologyAdapterProtocol, entity_id: str) -> str | None:
    value = adapter.definition(entity_id)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _mapping_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or len(text) > 512 or any(ord(char) < 32 for char in text):
        return None
    return text


def _mapping_candidates(
    adapter: OakOntologyAdapterProtocol,
    *,
    external_ids: Sequence[str],
    source_selector: str,
    ontology_revision: str,
    producer_revision: str,
    max_mappings: int = 256,
) -> tuple[str, tuple[OaklibMappingCandidateV1, ...]]:
    """Read bounded, revision-bound SSSOM suggestions when OAK supports them."""
    mapping_reader = getattr(adapter, "sssom_mappings", None)
    if not callable(mapping_reader):
        return "UNAVAILABLE", ()
    if not 1 <= max_mappings <= 1024:
        raise ValueError("OAKLIB_MAPPING_RESULT_LIMIT_OUT_OF_RANGE")

    normalized_ids = tuple(sorted({value.strip() for value in external_ids if value.strip()}))
    if not normalized_ids:
        return "AVAILABLE", ()

    raw_rows = list(islice(mapping_reader(normalized_ids), max_mappings + 1))
    if len(raw_rows) > max_mappings:
        raise ValueError("OAKLIB_MAPPING_RESULT_LIMIT_EXCEEDED")

    rows: dict[tuple[str, str, str], OaklibMappingCandidateV1] = {}
    for row in raw_rows:
        subject = _mapping_text(getattr(row, "subject_id", None))
        predicate = _mapping_text(getattr(row, "predicate_id", None))
        obj = _mapping_text(getattr(row, "object_id", None))
        if not subject or not predicate or not obj:
            raise ValueError("OAKLIB_MAPPING_CANDIDATE_INVALID")
        if subject not in normalized_ids and obj not in normalized_ids:
            raise ValueError("OAKLIB_MAPPING_CANDIDATE_UNBOUND")

        raw_confidence = getattr(row, "confidence", None)
        confidence: float | None = None
        if raw_confidence is not None:
            if isinstance(raw_confidence, bool) or not isinstance(raw_confidence, (int, float)):
                raise ValueError("OAKLIB_MAPPING_CONFIDENCE_INVALID")
            confidence = float(raw_confidence)
            if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
                raise ValueError("OAKLIB_MAPPING_CONFIDENCE_INVALID")

        key = (subject, predicate, obj)
        rows[key] = OaklibMappingCandidateV1(
            schema="atlas.oaklib-mapping-candidate.v1",
            candidateId=_stable_id(
                "oaklib-mapping-candidate", source_selector, subject, predicate, obj,
                ontology_revision, producer_revision,
            ),
            subjectId=subject,
            predicateId=predicate,
            objectId=obj,
            mappingJustification=_mapping_text(getattr(row, "mapping_justification", None)),
            subjectSource=_mapping_text(getattr(row, "subject_source", None)),
            objectSource=_mapping_text(getattr(row, "object_source", None)),
            subjectSourceVersion=_mapping_text(getattr(row, "subject_source_version", None)),
            objectSourceVersion=_mapping_text(getattr(row, "object_source_version", None)),
            confidence=confidence,
            ontologyRevision=ontology_revision,
            producerRevision=producer_revision,
            evidenceRefs=(f"oaklib:{source_selector}:sssom:{subject}|{predicate}|{obj}",),
        )
    return "AVAILABLE", tuple(rows[key] for key in sorted(rows))


def _concept_candidate(
    adapter: OakOntologyAdapterProtocol,
    *,
    external_id: str,
    source_selector: str,
    namespace: str,
    ontology_revision: str,
    producer_revision: str,
) -> OaklibConceptCandidateV1:
    evidence_ref = f"oaklib:{source_selector}:entity:{external_id}"
    return OaklibConceptCandidateV1(
        schema="atlas.oaklib-concept-candidate.v1",
        candidateId=_stable_id(
            "oaklib-concept-candidate",
            source_selector,
            external_id,
            ontology_revision,
            producer_revision,
        ),
        externalId=external_id,
        label=_safe_label(adapter, external_id),
        description=_safe_definition(adapter, external_id),
        namespace=namespace,
        ontologyRevision=ontology_revision,
        producerRevision=producer_revision,
        evidenceRefs=(evidence_ref,),
    )


def build_oaklib_candidate_bundle_v1(
    adapter: OakOntologyAdapterProtocol,
    *,
    subjects: Sequence[str],
    source_selector: str,
    ontology_revision: str,
    producer_revision: str,
    namespace: str = "external-oaklib",
    max_relationships: int = 512,
) -> OaklibCandidateBundleV1:
    """Normalize OAK entities/relationships into non-canonical Atlas candidates.

    Every subject and every relationship object becomes a concept candidate.
    Predicates remain external relation identifiers; mapping a predicate to an
    Atlas relation type is deliberately a later review/promotion concern.
    """

    normalized_subjects = tuple(sorted({subject.strip() for subject in subjects if subject.strip()}))
    if not normalized_subjects:
        raise ValueError("OAKLIB_ADAPTER_REQUIRES_AT_LEAST_ONE_SUBJECT")
    if len(normalized_subjects) > 32:
        raise ValueError("OAKLIB_ADAPTER_SUBJECT_COUNT_OUT_OF_RANGE")
    if not 1 <= max_relationships <= 4096:
        raise ValueError("OAKLIB_ADAPTER_RELATIONSHIP_LIMIT_OUT_OF_RANGE")
    if not source_selector.strip():
        raise ValueError("OAKLIB_ADAPTER_REQUIRES_SOURCE_SELECTOR")
    if not ontology_revision.strip():
        raise ValueError("OAKLIB_ADAPTER_REQUIRES_ONTOLOGY_REVISION")
    if not producer_revision.strip():
        raise ValueError("OAKLIB_ADAPTER_REQUIRES_PRODUCER_REVISION")

    # OAK exposes relationship results as an iterable. Consume one sentinel row
    # beyond the public cap so large/remote ontologies fail closed instead of
    # returning a silently incomplete relation set or materializing everything.
    raw_relation_rows = list(islice(adapter.relationships(normalized_subjects), max_relationships + 1))
    if len(raw_relation_rows) > max_relationships:
        raise ValueError("OAKLIB_RELATION_RESULT_LIMIT_EXCEEDED")
    relation_rows = sorted(
        {
            (str(subject).strip(), str(predicate).strip(), str(obj).strip())
            for subject, predicate, obj in raw_relation_rows
            if str(subject).strip() and str(predicate).strip() and str(obj).strip()
        }
    )

    concept_ids = set(normalized_subjects)
    for subject, _predicate, obj in relation_rows:
        concept_ids.add(subject)
        concept_ids.add(obj)

    concepts = tuple(
        _concept_candidate(
            adapter,
            external_id=external_id,
            source_selector=source_selector,
            namespace=namespace,
            ontology_revision=ontology_revision,
            producer_revision=producer_revision,
        )
        for external_id in sorted(concept_ids)
    )

    mapping_provider_status, mapping_candidates = _mapping_candidates(
        adapter,
        external_ids=sorted(concept_ids),
        source_selector=source_selector,
        ontology_revision=ontology_revision,
        producer_revision=producer_revision,
    )

    relations = tuple(
        OaklibRelationCandidateV1(
            schema="atlas.oaklib-relation-candidate.v1",
            candidateId=_stable_id(
                "oaklib-relation-candidate",
                source_selector,
                subject,
                predicate,
                obj,
                ontology_revision,
                producer_revision,
            ),
            subjectExternalId=subject,
            predicateExternalId=predicate,
            objectExternalId=obj,
            subjectLabel=_safe_label(adapter, subject),
            predicateLabel=adapter.label(predicate),
            objectLabel=_safe_label(adapter, obj),
            ontologyRevision=ontology_revision,
            producerRevision=producer_revision,
            evidenceRefs=(f"oaklib:{source_selector}:relation:{subject}|{predicate}|{obj}",),
        )
        for subject, predicate, obj in relation_rows
    )

    return OaklibCandidateBundleV1(
        schema="atlas.oaklib-candidate-bundle.v1",
        sourceSelector=source_selector,
        ontologyRevision=ontology_revision,
        producerRevision=producer_revision,
        concepts=concepts,
        relations=relations,
        mappingProviderStatus=mapping_provider_status,
        mappingCandidates=mapping_candidates,
    )


def search_oaklib_label_candidates_v1(
    adapter: OakOntologyAdapterProtocol,
    *,
    terms: Sequence[str],
    source_selector: str,
    ontology_revision: str,
    producer_revision: str,
    namespace: str = "external-oaklib",
    max_candidates_per_term: int = 8,
) -> dict[str, object]:
    """Return bounded lexical OAK search candidates without creating tuples."""

    if not 1 <= len(terms) <= 16:
        raise ValueError("OAKLIB_SEARCH_TERM_COUNT_OUT_OF_RANGE")
    if not 1 <= max_candidates_per_term <= 16:
        raise ValueError("OAKLIB_SEARCH_RESULT_LIMIT_OUT_OF_RANGE")
    if not source_selector.strip() or not ontology_revision.strip() or not producer_revision.strip():
        raise ValueError("OAKLIB_SEARCH_REVISION_OR_SOURCE_MISSING")

    normalized_terms: list[str] = []
    seen_terms: set[str] = set()
    for raw_term in terms:
        term = unicodedata.normalize("NFC", raw_term).strip()
        if not term or len(term) > 256 or any(ord(char) < 32 for char in term):
            raise ValueError("OAKLIB_SEARCH_TERM_INVALID")
        if term.casefold() not in seen_terms:
            normalized_terms.append(term)
            seen_terms.add(term.casefold())

    if not normalized_terms:
        raise ValueError("OAKLIB_SEARCH_REQUIRES_TERMS")

    basic_search = getattr(adapter, "basic_search", None)
    if not callable(basic_search):
        raise RuntimeError("OAKLIB_SEARCH_INTERFACE_UNAVAILABLE")

    try:
        from oaklib.datamodels.search import SearchConfiguration
        search_config = SearchConfiguration(
            limit=max_candidates_per_term * 8,
        )
    except ImportError:  # Keep the protocol usable with dependency-free test adapters.
        search_config = None

    supports_search_config = False
    if search_config is not None:
        try:
            parameters = signature(basic_search).parameters.values()
            supports_search_config = any(parameter.kind == Parameter.VAR_POSITIONAL for parameter in parameters) or len([
                parameter for parameter in parameters
                if parameter.kind in (Parameter.POSITIONAL_ONLY, Parameter.POSITIONAL_OR_KEYWORD)
            ]) >= 2
        except (TypeError, ValueError):
            # Some extension-backed callables do not expose signatures; the OAK
            # SearchInterface contract accepts SearchConfiguration.
            supports_search_config = True

    matches: list[dict[str, object]] = []
    candidate_ids: set[str] = set()
    for term in normalized_terms:
        found: set[str] = set()
        result_iterator = (
            basic_search(term, search_config)
            if search_config is not None and supports_search_config
            else basic_search(term)
        )
        for result in islice(result_iterator, max_candidates_per_term * 8):
            external_id = str(result).strip()
            if external_id and len(external_id) <= 256 and not any(ord(char) < 32 for char in external_id):
                found.add(external_id)
        selected = sorted(found)[:max_candidates_per_term]
        candidate_ids.update(selected)
        matches.append({"searchText": term, "externalIds": selected})

    concepts = [
        asdict(_concept_candidate(
            adapter,
            external_id=external_id,
            source_selector=source_selector,
            namespace=namespace,
            ontology_revision=ontology_revision,
            producer_revision=producer_revision,
        ))
        for external_id in sorted(candidate_ids)
    ]
    mapping_provider_status, mapping_candidates = _mapping_candidates(
        adapter,
        external_ids=sorted(candidate_ids),
        source_selector=source_selector,
        ontology_revision=ontology_revision,
        producer_revision=producer_revision,
    )
    return {
        "schema": "atlas.oaklib-candidate-bundle.v1",
        "sourceSelector": source_selector,
        "ontologyRevision": ontology_revision,
        "producerRevision": producer_revision,
        "concepts": concepts,
        "relations": [],
        "mappingProviderStatus": mapping_provider_status,
        "mappingCandidates": [
            {**asdict(row), "evidenceRefs": list(row.evidenceRefs)}
            for row in mapping_candidates
        ],
        "canonicalAuthority": False,
        "matches": matches,
    }


def load_oaklib_candidate_bundle_v1(
    *,
    resource_selector: str,
    subjects: Sequence[str],
    ontology_revision: str,
    producer_revision: str = "oaklib-adapter-v1",
    namespace: str = "external-oaklib",
    source_selector: str | None = None,
    max_relationships: int = 512,
) -> OaklibCandidateBundleV1:
    """Load a real oaklib adapter lazily and return reviewable candidates.

    `oaklib` remains an optional runtime dependency. Importing the Parent Atlas
    ontology package does not require oaklib unless this function is invoked.
    """

    try:
        from oaklib import get_adapter
    except ImportError as exc:  # pragma: no cover - exercised on workstation
        raise RuntimeError(
            "OAKLIB_NOT_INSTALLED: install the pinned optional dependency "
            "from python/requirements-oaklib-adapter.txt"
        ) from exc

    adapter = get_adapter(resource_selector)
    return build_oaklib_candidate_bundle_v1(
        adapter,
        subjects=subjects,
        source_selector=source_selector or resource_selector,
        ontology_revision=ontology_revision,
        producer_revision=producer_revision,
        namespace=namespace,
        max_relationships=max_relationships,
    )


def load_oaklib_label_candidates_v1(
    *,
    resource_selector: str,
    terms: Sequence[str],
    ontology_revision: str,
    producer_revision: str,
    source_selector: str = "atlas-local-ontology",
    namespace: str = "external-oaklib",
    max_candidates_per_term: int = 8,
) -> dict[str, object]:
    """Run bounded lexical search against a server-pinned OAK resource."""

    try:
        from oaklib import get_adapter
    except ImportError as exc:  # pragma: no cover - exercised on workstation
        raise RuntimeError(
            "OAKLIB_NOT_INSTALLED: install the pinned optional dependency "
            "from python/requirements-oaklib-adapter.txt"
        ) from exc

    return search_oaklib_label_candidates_v1(
        get_adapter(resource_selector),
        terms=terms,
        source_selector=source_selector,
        ontology_revision=ontology_revision,
        producer_revision=producer_revision,
        namespace=namespace,
        max_candidates_per_term=max_candidates_per_term,
    )
