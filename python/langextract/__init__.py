"""Local LangExtract-compatible package shim.

This project keeps a small, importable `langextract` package in the repo so the
Python sidecars can run even when the external package is absent or the editable
install points at a missing checkout path.
"""

from . import data, extract

__all__ = ["data", "extract"]

