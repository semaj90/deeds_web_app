"""Pytest configuration and shared fixtures."""

import pytest
import numpy as np
from typing import List, Dict, Any


# ============================================================================
# Fixtures for Embeddings
# ============================================================================

@pytest.fixture
def sample_embedding_fp16() -> np.ndarray:
    """Generate a sample FP16 embedding (768-dim)."""
    return np.random.randn(768).astype(np.float16)


@pytest.fixture
def sample_embeddings_batch(sample_embedding_fp16) -> np.ndarray:
    """Generate a batch of FP16 embeddings (32 x 768)."""
    return np.random.randn(32, 768).astype(np.float16)


@pytest.fixture
def sample_query_embedding() -> np.ndarray:
    """Generate a sample query embedding."""
    return np.random.randn(768).astype(np.float16)


# ============================================================================
# Fixtures for Runes
# ============================================================================

BASE_RUNES = [
    "𓂀", "✶", "◎", "⚖", "◈", "❂", "𓇳", "✧",
    "⚕", "✤", "☉", "◐", "𓅓", "◉", "●", "✱",
    "⚚", "𓃠", "✺", "⚔", "✦", "𓁹", "❖", "✴",
    "𓋹", "❉"
]


@pytest.fixture
def base_runes() -> List[str]:
    """Return the base set of runes."""
    return BASE_RUNES


@pytest.fixture
def sample_rune_bank(base_runes) -> List[Dict[str, Any]]:
    """Generate a sample rune bank."""
    import uuid
    rune_bank = []
    for idx, rune in enumerate(base_runes):
        rune_bank.append({
            "rune": rune,
            "tensor_uuid": uuid.uuid4().hex,
            "embedding_fp16": np.random.randn(768).astype(np.float16).tolist(),
            "latent_int4": np.random.randint(0, 256, 192).tobytes().hex(),
            "tile_index": idx,
        })
    return rune_bank


# ============================================================================
# Fixtures for Tiles
# ============================================================================

@pytest.fixture
def sample_tile() -> np.ndarray:
    """Generate a sample 32x32 tile."""
    return np.random.randint(0, 256, (32, 32), dtype=np.uint8)


@pytest.fixture
def sample_tiles_batch() -> np.ndarray:
    """Generate a batch of tiles (26 x 32 x 32)."""
    return np.random.randint(0, 256, (26, 32, 32), dtype=np.uint8)


# ============================================================================
# Fixtures for Retrieval Results
# ============================================================================

@pytest.fixture
def sample_retrieval_result() -> Dict[str, Any]:
    """Generate a sample retrieval result."""
    return {
        "rune": "𓂀",
        "score": 0.85,
        "source": "rag",
        "metadata": {
            "case_id": "PC-187",
            "statute": "CA Penal Code § 187",
            "relevance": 0.92,
        },
        "position_3d": [0.5, 0.3, 0.7],
        "tile_index": 0,
    }


@pytest.fixture
def sample_retrieval_results(sample_retrieval_result) -> List[Dict[str, Any]]:
    """Generate a batch of retrieval results."""
    results = []
    for i in range(10):
        result = sample_retrieval_result.copy()
        result["score"] = np.random.uniform(0.5, 1.0)
        result["position_3d"] = np.random.uniform(-1, 1, 3).tolist()
        results.append(result)
    return results


# ============================================================================
# Fixtures for Cartridges
# ============================================================================

@pytest.fixture
def sample_cartridge_metadata() -> Dict[str, Any]:
    """Generate sample cartridge metadata."""
    return {
        "version": 1,
        "query": "PC 187 appeal",
        "timestamp": "2024-01-01T00:00:00Z",
        "num_runes": 26,
        "num_edges": 52,
    }


# ============================================================================
# Markers
# ============================================================================

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "unit: mark test as a unit test")
    config.addinivalue_line("markers", "integration: mark test as an integration test")
    config.addinivalue_line("markers", "benchmark: mark test as a benchmark")
    config.addinivalue_line("markers", "property: mark test as a property-based test")
    config.addinivalue_line("markers", "gpu: mark test as GPU-dependent")
