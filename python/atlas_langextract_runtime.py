"""Select the official LangExtract package or the local compatibility shim."""

from __future__ import annotations

import importlib
from importlib import metadata as importlib_metadata
import os
import sys
from pathlib import Path
from types import ModuleType


def load_langextract() -> ModuleType:
    """Load official LangExtract without allowing the local shim to shadow it."""

    if os.getenv("LANGEXTRACT_RUNTIME", "shim").strip().lower() != "official":
        return importlib.import_module("langextract")

    package_root = Path(__file__).resolve().parent
    original_path = list(sys.path)
    existing = sys.modules.pop("langextract", None)
    try:
        sys.path[:] = [entry for entry in sys.path if Path(entry or ".").resolve() != package_root]
        module = importlib.import_module("langextract")
        module.__atlas_runtime_version__ = importlib_metadata.version("langextract")
    except Exception:
        if existing is not None:
            sys.modules["langextract"] = existing
        raise
    finally:
        sys.path[:] = original_path

    sys.modules["langextract"] = module
    return module
