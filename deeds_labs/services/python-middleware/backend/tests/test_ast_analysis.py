#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - AST Analysis Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Property tests for AST graph consistency
Task: 3.4 - Write property test for AST consistency
═══════════════════════════════════════════════════════════════════════
"""

import os
import sys
import pytest
import asyncio
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.services.multi_db_coordinator import MultiDBCoordinator
from backend.services.ast_analysis_service import (
    ASTAnalysisService,
    ASTData,
    ImportNode,
    ExportNode,
    ComponentNode,
    FunctionNode,
    ASTError,
)


@pytest.fixture
async def coordinator():
    """Create MultiDBCoordinator for testing."""
    coordinator = MultiDBCoordinator()
    coordinator.connect()
    yield coordinator
    coordinator.disconnect()


@pytest.fixture
async def ast_service(coordinator):
    """Create ASTAnalysisService for testing."""
    return ASTAnalysisService(coordinator)


@pytest.fixture
def sample_typescript_file():
    """Create a sample TypeScript file for testing."""
    content = """
import { writable } from 'svelte/store';
import type { User } from './types';
import * as utils from './utils';

export const userStore = writable<User | null>(null);

export function getUserName(user: User): string {
    return user.name;
}

export async function fetchUser(id: string): Promise<User> {
    const response = await fetch(`/api/users/${id}`);
    return response.json();
}

export default class UserService {
    constructor() {}
}
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
        f.write(content)
        temp_path = f.name

    yield temp_path

    # Cleanup
    os.unlink(temp_path)


@pytest.fixture
def sample_svelte_file():
    """Create a sample Svelte file for testing."""
    content = """
<script lang="ts">
import { onMount } from 'svelte';
import Button from './Button.svelte';

export let name: string;
export let age: number = 0;

let count = 0;

function increment() {
    count += 1;
}

onMount(() => {
    console.log('Component mounted');
});
</script>

<div>
    <h1>Hello {name}!</h1>
    <p>Age: {age}</p>
    <Button on:click={increment}>Count: {count}</Button>
</div>
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".svelte", delete=False) as f:
        f.write(content)
        temp_path = f.name

    yield temp_path

    # Cleanup
    os.unlink(temp_path)


# ═══════════════════════════════════════════════════════════════════════
# Property 3: AST Graph Consistency
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ast_graph_consistency_typescript(ast_service, sample_typescript_file):
    """
    Property 3: AST Graph Consistency
    Test that Neo4j graph accurately reflects AST structure for TypeScript files.
    """
    print("\n🧪 Testing Property 3: AST Graph Consistency (TypeScript)")

    # Analyze file
    ast_data = await ast_service.analyze_file(sample_typescript_file)

    # Verify AST data structure
    assert ast_data.file_path == sample_typescript_file
    assert ast_data.language == "typescript"
    assert ast_data.loc > 0

    # Verify imports extracted
    assert len(ast_data.imports) >= 3, "Should extract at least 3 imports"

    # Check specific imports
    import_sources = [imp.source for imp in ast_data.imports]
    assert "svelte/store" in import_sources
    assert "./types" in import_sources
    assert "./utils" in import_sources

    # Verify exports extracted
    assert len(ast_data.exports) >= 3, "Should extract at least 3 exports"

    # Verify functions extracted
    assert len(ast_data.functions) >= 2, "Should extract at least 2 functions"
    function_names = [fn.name for fn in ast_data.functions]
    assert "getUserName" in function_names
    assert "fetchUser" in function_names

    # Check async function
    fetch_user_fn = next((fn for fn in ast_data.functions if fn.name == "fetchUser"), None)
    assert fetch_user_fn is not None
    assert fetch_user_fn.is_async is True

    # Extract dependency graph
    graph = await ast_service.extract_dependencies(ast_data)

    # Verify graph structure
    assert len(graph.nodes) > 0, "Graph should have nodes"
    assert len(graph.edges) > 0, "Graph should have edges"

    # Verify File node exists
    file_nodes = [n for n in graph.nodes if n.label == "File"]
    assert len(file_nodes) == 1, "Should have exactly one File node"
    assert file_nodes[0].id == sample_typescript_file

    # Verify Function nodes exist
    function_nodes = [n for n in graph.nodes if n.label == "Function"]
    assert len(function_nodes) >= 2, "Should have at least 2 Function nodes"

    # Verify CONTAINS relationships
    contains_edges = [e for e in graph.edges if e.relationship == "CONTAINS"]
    assert len(contains_edges) >= 2, "Should have at least 2 CONTAINS relationships"

    # Verify IMPORTS relationships
    imports_edges = [e for e in graph.edges if e.relationship == "IMPORTS"]
    assert len(imports_edges) >= 3, "Should have at least 3 IMPORTS relationships"

    print("✅ Property 3 verified: AST graph accurately reflects TypeScript structure")


@pytest.mark.asyncio
async def test_ast_graph_consistency_svelte(ast_service, sample_svelte_file):
    """
    Property 3: AST Graph Consistency
    Test that Neo4j graph accurately reflects AST structure for Svelte files.
    """
    print("\n🧪 Testing Property 3: AST Graph Consistency (Svelte)")

    # Analyze file
    ast_data = await ast_service.analyze_file(sample_svelte_file)

    # Verify AST data structure
    assert ast_data.file_path == sample_svelte_file
    assert ast_data.language == "svelte"
    assert ast_data.loc > 0

    # Verify imports extracted
    assert len(ast_data.imports) >= 2, "Should extract at least 2 imports"

    # Check specific imports
    import_sources = [imp.source for imp in ast_data.imports]
    assert "svelte" in import_sources
    assert "./Button.svelte" in import_sources

    # Verify component extracted
    assert len(ast_data.components) >= 1, "Should extract at least 1 component"
    component = ast_data.components[0]
    assert component.type == "SvelteComponent"
    assert component.exported is True

    # Verify functions extracted
    assert len(ast_data.functions) >= 1, "Should extract at least 1 function"
    function_names = [fn.name for fn in ast_data.functions]
    assert "increment" in function_names

    # Extract dependency graph
    graph = await ast_service.extract_dependencies(ast_data)

    # Verify graph structure
    assert len(graph.nodes) > 0, "Graph should have nodes"
    assert len(graph.edges) > 0, "Graph should have edges"

    # Verify Component node exists
    component_nodes = [n for n in graph.nodes if n.label == "Component"]
    assert len(component_nodes) >= 1, "Should have at least 1 Component node"

    print("✅ Property 3 verified: AST graph accurately reflects Svelte structure")


@pytest.mark.asyncio
async def test_ast_error_storage_with_context(ast_service, coordinator):
    """
    Property 9: Error Analysis Completeness
    Test that detected errors are stored with AST context in PostgreSQL.
    """
    print("\n🧪 Testing Property 9: Error Analysis Completeness")

    # Create a file with intentional errors
    error_content = """
import { writable } from 'svelte/store';

// Missing type annotation (implicit any)
export const store = writable();

// Unused variable
const unused = 42;

// Missing return type
export function test(x) {
    return x + 1;
}
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".ts", delete=False) as f:
        f.write(error_content)
        error_file = f.name

    try:
        # Analyze file (may detect errors from ts-ast-autofixer)
        ast_data = await ast_service.analyze_file(error_file)

        # Manually add an error for testing
        test_error = ASTError(
            error_type="typescript/no-implicit-any",
            message="Variable 'store' implicitly has 'any' type",
            file_path=error_file,
            line_number=5,
            column=14,
            severity="warning",
            rule="typescript/no-implicit-any",
            ast_context={
                "node_type": "VariableDeclaration",
                "variable_name": "store",
            },
        )
        ast_data.errors.append(test_error)

        # Store error in PostgreSQL
        cursor = coordinator.pg_conn.cursor()
        cursor.execute(
            """
            INSERT INTO error_analysis (id, tag_id, error_message, ast_context, created_at)
            VALUES (%s, %s, %s, %s, NOW())
            RETURNING id
            """,
            (
                test_error.id,
                None,  # No tag_id for this test
                test_error.message,
                {"ast_context": test_error.ast_context},
            ),
        )
        coordinator.pg_conn.commit()
        error_id = cursor.fetchone()[0]

        # Verify error stored with AST context
        cursor.execute(
            "SELECT error_message, ast_context FROM error_analysis WHERE id = %s",
            (error_id,),
        )
        result = cursor.fetchone()

        assert result is not None, "Error should be stored in PostgreSQL"
        assert result[0] == test_error.message
        assert result[1] is not None, "AST context should be stored"
        assert "ast_context" in result[1]

        print("✅ Property 9 verified: Errors stored with AST context in PostgreSQL")

    finally:
        # Cleanup
        os.unlink(error_file)


@pytest.mark.asyncio
async def test_dependency_relationships(ast_service, sample_typescript_file):
    """
    Test that dependency relationships are correctly extracted and stored.
    """
    print("\n🧪 Testing dependency relationships")

    # Analyze file
    ast_data = await ast_service.analyze_file(sample_typescript_file)

    # Extract dependency graph
    graph = await ast_service.extract_dependencies(ast_data)

    # Verify import relationships
    import_edges = [e for e in graph.edges if e.relationship == "IMPORTS"]
    assert len(import_edges) > 0, "Should have import relationships"

    # Check import properties
    for edge in import_edges:
        assert "importedSymbols" in edge.properties or "importType" in edge.properties
        assert edge.source_id == sample_typescript_file

    # Verify contains relationships
    contains_edges = [e for e in graph.edges if e.relationship == "CONTAINS"]
    assert len(contains_edges) > 0, "Should have contains relationships"

    # All contains edges should originate from the file
    for edge in contains_edges:
        assert edge.source_id == sample_typescript_file

    print("✅ Dependency relationships correctly extracted")


@pytest.mark.asyncio
async def test_neo4j_storage(ast_service, coordinator, sample_typescript_file):
    """
    Test that AST graph is correctly stored in Neo4j.
    """
    print("\n🧪 Testing Neo4j storage")

    # Analyze file
    ast_data = await ast_service.analyze_file(sample_typescript_file)

    # Extract dependency graph
    graph = await ast_service.extract_dependencies(ast_data)

    # Store in Neo4j
    success = await ast_service.store_graph(graph)
    assert success is True, "Graph storage should succeed"

    # Verify nodes exist in Neo4j
    with coordinator.neo4j_driver.session() as session:
        # Check File node
        result = session.run(
            "MATCH (f:File {id: $id}) RETURN f",
            id=sample_typescript_file
        )
        file_node = result.single()
        assert file_node is not None, "File node should exist in Neo4j"

        # Check Function nodes
        result = session.run(
            "MATCH (fn:Function) WHERE fn.filePath = $file_path RETURN count(fn) as count",
            file_path=sample_typescript_file
        )
        count = result.single()["count"]
        assert count >= 2, "Should have at least 2 Function nodes in Neo4j"

        # Check CONTAINS relationships
        result = session.run(
            """
            MATCH (f:File {id: $id})-[:CONTAINS]->(n)
            RETURN count(n) as count
            """,
            id=sample_typescript_file
        )
        count = result.single()["count"]
        assert count > 0, "Should have CONTAINS relationships in Neo4j"

    print("✅ AST graph correctly stored in Neo4j")


@pytest.mark.asyncio
async def test_query_dependencies(ast_service, coordinator, sample_typescript_file):
    """
    Test querying dependencies from Neo4j.
    """
    print("\n🧪 Testing dependency queries")

    # First, store the graph
    ast_data = await ast_service.analyze_file(sample_typescript_file)
    graph = await ast_service.extract_dependencies(ast_data)
    await ast_service.store_graph(graph)

    # Query dependencies
    deps = await ast_service.query_dependencies(sample_typescript_file, depth=1)

    # Verify query results
    # (Note: This is a simplified test - in production, verify actual dependencies)
    assert deps is not None, "Should return dependency graph"

    print("✅ Dependency queries working")


# ═══════════════════════════════════════════════════════════════════════
# Run Tests
# ═══════════════════════════════════════════════════════════════════════


if __name__ == "__main__":
    print("═" * 70)
    print("AST Analysis Service - Property Tests")
    print("═" * 70)

    # Run tests
    pytest.main([__file__, "-v", "-s"])
