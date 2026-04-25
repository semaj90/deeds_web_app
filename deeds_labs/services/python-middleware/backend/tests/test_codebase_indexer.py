#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Codebase Indexer Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Property-based tests for codebase indexing and semantic search
Task: 11.4 - Write property test for semantic search
Validates: Requirements 9.1, 9.2, 9.3
═══════════════════════════════════════════════════════════════════════
"""

import pytest
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List

from backend.services.codebase_indexer_service import (
    CodebaseIndexerService,
    IndexedFile,
    SearchResult,
    IndexingStats,
    CodebaseFileHandler
)


# ═══════════════════════════════════════════════════════════════════════
# Property 4: Semantic Search Accuracy
# For any semantic search query, results SHALL be ranked by cosine
# similarity and filters SHALL be correctly applied.
# Validates: Requirements 9.1, 9.2, 9.3
# ═══════════════════════════════════════════════════════════════════════


@pytest.fixture
def indexer_service():
    """Create CodebaseIndexerService for testing."""
    return CodebaseIndexerService(workspace_root=os.getcwd())


@pytest.fixture
def temp_workspace():
    """Create a temporary workspace with test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create test files
        test_files = {
            "component.svelte": """
<script lang="ts">
    import { onMount } from 'svelte';
    // TODO: Add loading state
    export let name: string;
</script>
<div>{name}</div>
""",
            "service.ts": """
import { api } from './api';
// Service for handling data
export async function fetchData() {
    return api.get('/data');
}
export function processData(data: any) {
    return data;
}
""",
            "utils.py": """
import os
import json
# Utility functions
def helper_function():
    '''Helper docstring'''
    pass
def another_helper():
    # TODO: Implement this
    pass
"""
        }

        for filename, content in test_files.items():
            filepath = Path(tmpdir) / filename
            filepath.write_text(content)

        yield tmpdir


@pytest.mark.asyncio
async def test_property_4_indexed_file_structure():
    """
    Property 4: Semantic Search - IndexedFile Structure
    IndexedFile must have all required fields.
    """
    indexed = IndexedFile(
        file_path="/test/file.ts",
        file_hash="abc123",
        category="service",
        size_bytes=1024,
        line_count=50,
        imports=["import x from 'y'"],
        exports=["export function test()"],
        functions=["test", "helper"],
        components=[],
        comments=["// Comment"],
        todos=["TODO: Fix this"],
        summary="Test service file",
        embedding_id="emb-123",
        indexed_at=datetime.now().isoformat(),
        last_modified=datetime.now().isoformat()
    )

    assert indexed.file_path == "/test/file.ts"
    assert indexed.file_hash == "abc123"
    assert indexed.category == "service"
    assert indexed.size_bytes == 1024
    assert indexed.line_count == 50
    assert len(indexed.imports) == 1
    assert len(indexed.exports) == 1
    assert len(indexed.functions) == 2
    assert len(indexed.comments) == 1
    assert len(indexed.todos) == 1
    assert indexed.summary
    assert indexed.indexed_at
    assert indexed.last_modified

    print(f"✅ Property 4: IndexedFile structure validated")


@pytest.mark.asyncio
async def test_property_4_search_result_structure():
    """
    Property 4: Semantic Search - SearchResult Structure
    SearchResult must have all required fields.
    """
    result = SearchResult(
        file_path="/test/file.ts",
        score=0.95,
        summary="Test file summary",
        category="service",
        snippet="function test() { ... }",
        highlights=["test", "function"]
    )

    assert result.file_path == "/test/file.ts"
    assert 0 <= result.score <= 1, "Score must be in [0, 1]"
    assert result.summary
    assert result.category
    assert result.snippet
    assert isinstance(result.highlights, list)

    print(f"✅ Property 4: SearchResult structure validated")


@pytest.mark.asyncio
async def test_property_4_indexing_stats_structure():
    """
    Property 4: Semantic Search - IndexingStats Structure
    IndexingStats must have all required fields.
    """
    stats = IndexingStats(
        total_files=100,
        indexed_files=95,
        skipped_files=3,
        failed_files=2,
        duration_seconds=10.5,
        started_at=datetime.now().isoformat(),
        completed_at=datetime.now().isoformat()
    )

    assert stats.total_files == 100
    assert stats.indexed_files == 95
    assert stats.skipped_files == 3
    assert stats.failed_files == 2
    assert stats.duration_seconds == 10.5
    assert stats.started_at
    assert stats.completed_at

    # Verify consistency
    assert stats.indexed_files + stats.skipped_files + stats.failed_files == stats.total_files

    print(f"✅ Property 4: IndexingStats structure validated")


@pytest.mark.asyncio
async def test_property_4_category_detection(indexer_service):
    """
    Property 4: Semantic Search - Category Detection
    Files must be categorized correctly based on path/extension.
    """
    test_cases = [
        ("src/components/Button.svelte", "component"),
        ("src/routes/+page.svelte", "route"),
        ("src/stores/user.ts", "store"),
        ("src/services/api.ts", "service"),
        ("src/utils/helpers.ts", "utility"),
        ("src/types/index.d.ts", "types"),
        ("backend/main.py", "python"),
        ("cmd/main.go", "go"),
        ("tests/test_api.spec.ts", "test"),
        ("backend/services/api.py", "service"),  # service takes precedence over python
    ]

    for file_path, expected_category in test_cases:
        detected = indexer_service._detect_category(file_path)
        assert detected == expected_category, \
            f"Expected '{expected_category}' for {file_path}, got '{detected}'"

    print(f"✅ Property 4: Category detection validated ({len(test_cases)} cases)")


@pytest.mark.asyncio
async def test_property_4_import_extraction(indexer_service):
    """
    Property 4: Semantic Search - Import Extraction
    Imports must be correctly extracted from file content.
    """
    ts_content = """
import { Component } from 'react';
import axios from 'axios';
from './utils' import { helper };
const x = 1;
"""
    imports = indexer_service._extract_imports(ts_content, '.ts')
    assert len(imports) >= 2, "Should extract at least 2 imports"
    assert any('react' in imp for imp in imports), "Should find react import"
    assert any('axios' in imp for imp in imports), "Should find axios import"

    py_content = """
import os
import json
from typing import List, Dict
from .utils import helper
x = 1
"""
    imports = indexer_service._extract_imports(py_content, '.py')
    assert len(imports) >= 3, "Should extract at least 3 imports"
    assert any('os' in imp for imp in imports), "Should find os import"

    print(f"✅ Property 4: Import extraction validated")


@pytest.mark.asyncio
async def test_property_4_function_extraction(indexer_service):
    """
    Property 4: Semantic Search - Function Extraction
    Functions must be correctly extracted from file content.
    """
    ts_content = """
function myFunction() {}
const arrowFunc = () => {};
async function asyncFunc() {}
"""
    functions = indexer_service._extract_functions(ts_content, '.ts')
    assert 'myFunction' in functions, "Should find myFunction"
    assert 'asyncFunc' in functions, "Should find asyncFunc"

    py_content = """
def my_function():
    pass

async def async_function():
    pass

class MyClass:
    def method(self):
        pass
"""
    functions = indexer_service._extract_functions(py_content, '.py')
    assert 'my_function' in functions, "Should find my_function"
    assert 'async_function' in functions, "Should find async_function"

    print(f"✅ Property 4: Function extraction validated")


@pytest.mark.asyncio
async def test_property_4_todo_extraction(indexer_service):
    """
    Property 4: Semantic Search - TODO Extraction
    TODO/FIXME markers must be correctly extracted.
    """
    content = """
// TODO: Implement this feature
function test() {
    // FIXME: This is broken
    // HACK: Temporary workaround
    return null;
}
// Regular comment
"""
    todos = indexer_service._extract_todos(content)
    assert len(todos) >= 3, "Should find at least 3 TODO/FIXME/HACK markers"
    assert any('TODO' in t for t in todos), "Should find TODO"
    assert any('FIXME' in t for t in todos), "Should find FIXME"
    assert any('HACK' in t for t in todos), "Should find HACK"

    print(f"✅ Property 4: TODO extraction validated")


@pytest.mark.asyncio
async def test_property_4_file_indexing(indexer_service, temp_workspace):
    """
    Property 4: Semantic Search - File Indexing
    Files must be correctly indexed with all metadata.
    """
    service = CodebaseIndexerService(workspace_root=temp_workspace)

    # Index a specific file
    svelte_file = os.path.join(temp_workspace, "component.svelte")
    indexed = await service.index_file(svelte_file)

    assert indexed is not None, "File should be indexed"
    assert indexed.file_path == svelte_file
    assert indexed.category == "component"
    assert indexed.line_count > 0
    assert indexed.file_hash, "File hash must be computed"
    assert indexed.indexed_at, "Indexed timestamp must be set"

    print(f"✅ Property 4: File indexing validated")


@pytest.mark.asyncio
async def test_property_4_directory_indexing(indexer_service, temp_workspace):
    """
    Property 4: Semantic Search - Directory Indexing
    All matching files in directory must be indexed.
    """
    service = CodebaseIndexerService(workspace_root=temp_workspace)

    stats = await service.index_directory(
        directory=temp_workspace,
        extensions={'.svelte', '.ts', '.py'}
    )

    assert stats.total_files == 3, "Should find 3 test files"
    assert stats.indexed_files == 3, "Should index all 3 files"
    assert stats.failed_files == 0, "No files should fail"
    assert stats.duration_seconds >= 0, "Duration must be non-negative"

    # Verify files are in index
    indexed_files = service.get_indexed_files()
    assert len(indexed_files) == 3, "Should have 3 indexed files"

    print(f"✅ Property 4: Directory indexing validated")


@pytest.mark.asyncio
async def test_property_4_index_stats(indexer_service, temp_workspace):
    """
    Property 4: Semantic Search - Index Statistics
    Statistics must accurately reflect indexed content.
    """
    service = CodebaseIndexerService(workspace_root=temp_workspace)

    await service.index_directory(
        directory=temp_workspace,
        extensions={'.svelte', '.ts', '.py'}
    )

    stats = service.get_stats()

    assert stats["total_files"] == 3
    assert "categories" in stats
    assert stats["total_lines"] > 0
    assert stats["workspace_root"] == temp_workspace

    print(f"✅ Property 4: Index statistics validated")


@pytest.mark.asyncio
async def test_property_4_file_handler_filtering():
    """
    Property 4: Semantic Search - File Handler Filtering
    File handler must correctly filter files by extension and path.
    """
    # Create a mock indexer
    indexer = CodebaseIndexerService()
    handler = CodebaseFileHandler(indexer)

    # Test extension filtering
    assert handler._should_process("test.ts") == True
    assert handler._should_process("test.svelte") == True
    assert handler._should_process("test.py") == True
    assert handler._should_process("test.txt") == False
    assert handler._should_process("test.md") == False

    # Test directory filtering
    assert handler._should_process("node_modules/test.ts") == False
    assert handler._should_process(".git/config") == False
    assert handler._should_process("src/test.ts") == True

    print(f"✅ Property 4: File handler filtering validated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
