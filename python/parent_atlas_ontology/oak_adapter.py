"""Optional OAK/oaklib access adapter for Parent Atlas ontology projections.

OAK is used here as a read/query adapter over an external ontology backend.
It never mints Parent Atlas tuple IDs, revisions, concepts, packet keys, or
canonical identities, and it never promotes ontology assertions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional


class OaklibUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class OakConceptViewV1:
    curie: str
    label: Optional[str]
    aliases: tuple[str, ...]
    canonicalAuthority: bool = False


@dataclass(frozen=True, slots=True)
class OakRelationshipViewV1:
    subject: str
    predicate: str
    object: str
    predicateLabel: Optional[str]
    objectLabel: Optional[str]
    canonicalAuthority: bool = False


class ParentAtlasOakAdapter:
    """Thin non-owning facade around OAK's adapter/interface APIs."""

    canonicalAuthority = False

    def __init__(self, selector: str, *, _adapter: Any = None) -> None:
        if not str(selector).strip():
            raise ValueError("OAK_SELECTOR_REQUIRED")
        self.selector = selector
        if _adapter is not None:
            self._adapter = _adapter
            return
        try:
            from oaklib import get_adapter
        except ImportError as exc:  # optional dependency by design
            raise OaklibUnavailableError("OAKLIB_NOT_INSTALLED") from exc
        self._adapter = get_adapter(selector)

    def concept(self, curie: str) -> OakConceptViewV1:
        curie = str(curie).strip()
        if not curie:
            raise ValueError("OAK_CURIE_REQUIRED")
        aliases = tuple(str(value) for value in (self._adapter.entity_aliases(curie) or ()))
        return OakConceptViewV1(
            curie=curie,
            label=self._adapter.label(curie),
            aliases=aliases,
            canonicalAuthority=False,
        )

    def search(self, text: str, *, limit: int = 25) -> tuple[OakConceptViewV1, ...]:
        text = str(text).strip()
        if not text:
            raise ValueError("OAK_SEARCH_TEXT_REQUIRED")
        if limit <= 0:
            return tuple()
        rows: list[OakConceptViewV1] = []
        for curie in self._adapter.basic_search(text):
            rows.append(self.concept(str(curie)))
            if len(rows) >= limit:
                break
        return tuple(rows)

    def relationships(self, curie: str, *, limit: int = 256) -> tuple[OakRelationshipViewV1, ...]:
        curie = str(curie).strip()
        if not curie:
            raise ValueError("OAK_CURIE_REQUIRED")
        if limit <= 0:
            return tuple()
        rows: list[OakRelationshipViewV1] = []
        for subject, predicate, obj in self._adapter.relationships([curie]):
            rows.append(
                OakRelationshipViewV1(
                    subject=str(subject),
                    predicate=str(predicate),
                    object=str(obj),
                    predicateLabel=self._adapter.label(predicate),
                    objectLabel=self._adapter.label(obj),
                    canonicalAuthority=False,
                )
            )
            if len(rows) >= limit:
                break
        return tuple(rows)

    def ancestors(
        self,
        curie: str,
        *,
        predicates: Optional[Iterable[str]] = None,
        limit: int = 256,
    ) -> tuple[OakConceptViewV1, ...]:
        curie = str(curie).strip()
        if not curie:
            raise ValueError("OAK_CURIE_REQUIRED")
        if limit <= 0:
            return tuple()
        predicate_list = list(predicates) if predicates is not None else None
        rows: list[OakConceptViewV1] = []
        for ancestor in self._adapter.ancestors(curie, predicates=predicate_list):
            rows.append(self.concept(str(ancestor)))
            if len(rows) >= limit:
                break
        return tuple(rows)

    # Deliberately no create/update/delete/mint/promote methods. OAK may expose
    # mutation interfaces, but Parent Atlas canonical ontology writes are owned
    # by the TypeScript/Postgres admission path, not this adapter.
