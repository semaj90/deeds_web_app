"""
Granite-Docling Worker
W-I9 optimized document processing worker for Windows
"""

__version__ = "1.0.0"
__author__ = "Legal AI Team"
__license__ = "MIT"

try:
    from .config import get_config, WorkerConfig
    from .core.w_i9_profiler import get_w_i9_profile, W_I9Profiler

    __all__ = [
        "get_config",
        "WorkerConfig",
        "get_w_i9_profile",
        "W_I9Profiler",
    ]
except ImportError:
    # Allow imports to fail gracefully for testing
    __all__ = []
