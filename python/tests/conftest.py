"""Pytest root configuration for python/tests.

Ensures CUBLAS_WORKSPACE_CONFIG is set before any test imports or initializes
torch.cuda/cuBLAS, preventing CuBLAS deterministic runtime errors when test
modules enable torch.use_deterministic_algorithms(True) mid-session.
"""
from __future__ import annotations

import os

os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
