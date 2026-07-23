"""Compatibility data models for LangExtract-style examples."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Extraction:
    extraction_class: str
    extraction_text: str
    attributes: dict[str, Any] = field(default_factory=dict)
    start_char: int | None = None
    end_char: int | None = None


@dataclass(slots=True)
class ExampleData:
    text: str
    extractions: list[Extraction] = field(default_factory=list)

