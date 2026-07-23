"""Compatibility extractor for LangExtract-style call sites."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Iterable, Sequence

from .data import ExampleData, Extraction


@dataclass(slots=True)
class ExtractionResult:
    extractions: list[Extraction]


_PATTERNS: list[tuple[str, re.Pattern[str], dict[str, Any]]] = [
    ("DATE", re.compile(r"\b\d{4}-\d{2}-\d{2}\b"), {}),
    ("MONEY", re.compile(r"\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?"), {}),
    (
        "STATUTE",
        re.compile(r"\b\d{1,3}\s+(?:U\.?S\.?C\.?|C\.?F\.?R\.?)\s*§+\s*[\w\-\(\)]+", re.I),
        {},
    ),
    (
        "CASE",
        re.compile(r"\b[A-Z][A-Za-z.&'\-]+(?:\s+[A-Z][A-Za-z.&'\-]+){0,3}\s+v\.?\s+[A-Z][A-Za-z.&'\-]+(?:\s+[A-Z][A-Za-z.&'\-]+){0,3}\b"),
        {},
    ),
    (
        "PERSON",
        re.compile(r"\b(?:Justice|Judge|Chief Justice|Senator|Representative|Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?"),
        {},
    ),
    (
        "ORG",
        re.compile(r"\b(?:ACLU|FBI|CIA|DOJ|EPA|FTC|SEC|IRS|DEA|ATF|Department\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b", re.I),
        {},
    ),
    ("EMAIL", re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I), {}),
    ("PHONE", re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b"), {}),
]


def _iter_texts(text_or_documents: str | Sequence[str] | Sequence[dict[str, Any]]) -> Iterable[str]:
    if isinstance(text_or_documents, str):
        yield text_or_documents
        return
    for item in text_or_documents:
        if isinstance(item, str):
            yield item
        elif isinstance(item, dict):
            yield str(item.get("text", ""))
        else:
            yield str(getattr(item, "text", ""))


def _heuristic_extractions(text: str) -> list[Extraction]:
    extractions: list[Extraction] = []
    seen: set[tuple[str, int, int]] = set()
    for label, pattern, attributes in _PATTERNS:
        for match in pattern.finditer(text):
            key = (label, match.start(), match.end())
            if key in seen:
                continue
            seen.add(key)
            extractions.append(
                Extraction(
                    extraction_class=label,
                    extraction_text=match.group(0),
                    attributes=dict(attributes),
                    start_char=match.start(),
                    end_char=match.end(),
                )
            )
    return extractions


def extract(
    text_or_documents: str | Sequence[str] | Sequence[dict[str, Any]],
    prompt_description: str,
    examples: Sequence[ExampleData] | None = None,
    model_id: str | None = None,
    model_url: str | None = None,
    fence_output: bool = False,
    use_schema_constraints: bool = False,
    extraction_passes: int = 1,
    temperature: float = 0.0,
    max_workers: int = 1,
    max_char_buffer: int = 2000,
    **_: Any,
) -> ExtractionResult:
    del prompt_description, examples, model_id, model_url, fence_output, use_schema_constraints, extraction_passes, temperature, max_workers, max_char_buffer
    merged: list[Extraction] = []
    for text in _iter_texts(text_or_documents):
        merged.extend(_heuristic_extractions(text))
    return ExtractionResult(extractions=merged)

