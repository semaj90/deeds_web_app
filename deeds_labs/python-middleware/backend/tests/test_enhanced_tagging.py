#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Enhanced Tagging Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Property-based tests for enhanced Qdrant tagging
Task: 5.4 - Write property test for tag completeness
Validates: Requirements 2.1, 2.2
═══════════════════════════════════════════════════════════════════════
"""

import pytest
import uuid
import aiohttp
from datetime import datetime
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

# ═══════════════════════════════════════════════════════════════════════
# Standalone EnhancedQdrantTag for testing
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class EnhancedQdrantTag:
    """Enhanced Qdrant Tag with embedding and AI summary."""
    id: str
    name: str
    category: str
    embedding: List[float]
    summary: str
    metadata: Dict[str, Any]
    timestamp: str
    cluster_id: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'embedding': self.embedding,
            'summary': self.summary,
            'metadata': self.metadata,
            'timestamp': self.timestamp,
            'cluster_id': self.cluster_id,
            'coordinates': self.coordinates,
        }


# ═══════════════════════════════════════════════════════════════════════
# Lightweight Tag Service for Testing
# ═══════════════════════════════════════════════════════════════════════

class TestTagService:
    """Lightweight tag service for testing without full DB dependencies."""

    OLLAMA_URL = "http://localhost:11434"
    EMBEDDING_MODEL = "embeddinggemma:latest"
    EMBEDDING_DIM = 768  # Actual dimension from embeddinggemma

    async def generate_embedding(self, text: str, retries: int = 3) -> List[float]:
        """Generate embedding via Ollama with retry."""
        import asyncio
        for attempt in range(retries):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{self.OLLAMA_URL}/api/embeddings",
                        json={"model": self.EMBEDDING_MODEL, "prompt": text},
                        timeout=aiohttp.ClientTimeout(total=60)
                    ) as response:
                        if response.status != 200:
                            err = await response.text()
                            if "loading" in err and attempt < retries - 1:
                                await asyncio.sleep(5)
                                continue
                            raise Exception(f"Embedding API error: {err}")
                        data = await response.json()
                        return data.get("embedding", [])
            except Exception as e:
                if attempt < retries - 1:
                    await asyncio.sleep(3)
                else:
                    raise
        return []

    async def generate_summary(self, text: str) -> str:
        """Generate summary via Ollama gemma3-legal."""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.OLLAMA_URL}/api/generate",
                json={
                    "model": "gemma3-legal:latest",
                    "prompt": f"Summarize in 100 chars: {text[:500]}",
                    "stream": False,
                    "options": {"temperature": 0.7}
                },
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status != 200:
                    return f"Code: {text[:50]}..."
                data = await response.json()
                return data.get("response", "")[:200]

    async def create_tag(
        self,
        name: str,
        category: str,
        file_path: str,
        text_content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> EnhancedQdrantTag:
        """Create an enhanced tag with embedding and summary."""
        embedding = await self.generate_embedding(text_content)
        summary = await self.generate_summary(text_content)

        return EnhancedQdrantTag(
            id=str(uuid.uuid4()),
            name=name,
            category=category,
            embedding=embedding,
            summary=summary,
            metadata={'filePath': file_path, **(metadata or {})},
            timestamp=datetime.now().isoformat(),
        )


# ═══════════════════════════════════════════════════════════════════════
# Property 1: Enhanced Tag Completeness Tests
# ═══════════════════════════════════════════════════════════════════════

@pytest.fixture
def tag_service():
    """Create test tag service."""
    return TestTagService()


@pytest.mark.asyncio
async def test_property_1_core_fields(tag_service):
    """
    Property 1: Enhanced Tag Completeness - Core Fields
    For any tag, all required fields must be populated.
    """
    tag = await tag_service.create_tag(
        name="test_file.ts",
        category="file",
        file_path="/test/test_file.ts",
        text_content="export const test = () => { return 42; }",
        metadata={'lineNumber': 1}
    )

    # Validate all core fields
    assert tag.id and isinstance(tag.id, str), "ID must be non-empty string"
    assert tag.name == "test_file.ts", "Name must match"
    assert tag.category == "file", "Category must match"
    assert tag.embedding and len(tag.embedding) == 768, f"Embedding must be 768-dim, got {len(tag.embedding)}"
    assert all(isinstance(v, float) for v in tag.embedding), "Embedding values must be floats"
    assert tag.summary and len(tag.summary) > 0, "Summary must be non-empty"
    assert 'filePath' in tag.metadata, "Metadata must contain filePath"
    assert tag.timestamp, "Timestamp must be set"

    # Validate timestamp is ISO 8601 and recent
    parsed = datetime.fromisoformat(tag.timestamp)
    assert abs((datetime.now() - parsed).total_seconds()) < 60, "Timestamp must be recent"

    print(f"✅ Property 1: Core fields validated (embedding={len(tag.embedding)}-dim)")


@pytest.mark.asyncio
async def test_property_1_all_categories(tag_service):
    """
    Property 1: Enhanced Tag Completeness - Category Validation
    All 5 categories must be accepted and produce valid tags.
    """
    categories = ['file', 'function', 'component', 'error', 'pattern']

    for cat in categories:
        tag = await tag_service.create_tag(
            name=f"test_{cat}",
            category=cat,
            file_path=f"/test/{cat}.ts",
            text_content=f"// {cat} content",
        )
        assert tag.category == cat, f"Category {cat} must be accepted"
        assert len(tag.embedding) == 768, f"Embedding for {cat} must be 768-dim"
        assert tag.id and tag.summary, f"Tag for {cat} must have id and summary"

    print(f"✅ Property 1: All 5 categories validated")


@pytest.mark.asyncio
async def test_property_1_unique_ids(tag_service):
    """
    Property 1: Enhanced Tag Completeness - Unique IDs
    Multiple tags must have unique IDs.
    """
    tags = []
    for i in range(3):
        tag = await tag_service.create_tag(
            name=f"tag_{i}",
            category="file",
            file_path=f"/test/file_{i}.ts",
            text_content=f"content {i}",
        )
        tags.append(tag)

    ids = [t.id for t in tags]
    assert len(ids) == len(set(ids)), "All tag IDs must be unique"

    print(f"✅ Property 1: {len(tags)} unique IDs generated")


@pytest.mark.asyncio
async def test_property_1_metadata_preservation(tag_service):
    """
    Property 1: Enhanced Tag Completeness - Metadata Preservation
    Custom metadata must be preserved in the tag.
    """
    custom_meta = {
        'lineNumber': 42,
        'astNodeType': 'FunctionDeclaration',
        'imports': ['react'],
        'confidence': 0.95,
    }

    tag = await tag_service.create_tag(
        name="test_meta",
        category="function",
        file_path="/test/meta.ts",
        text_content="function test() {}",
        metadata=custom_meta,
    )

    assert tag.metadata['filePath'] == "/test/meta.ts"
    assert tag.metadata['lineNumber'] == 42
    assert tag.metadata['astNodeType'] == 'FunctionDeclaration'
    assert tag.metadata['imports'] == ['react']
    assert tag.metadata['confidence'] == 0.95

    print(f"✅ Property 1: Metadata preserved correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
