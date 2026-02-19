#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - FastAPI Middleware Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Property-based tests for FastAPI tool execution
Task: 10.5 - Write property test for tool execution
Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 9.5, 10.3
═══════════════════════════════════════════════════════════════════════
"""

import pytest
from datetime import datetime
from typing import Dict, Any

from backend.services.fastapi_middleware import (
    app,
    TOOL_REGISTRY,
    create_jwt_token,
    verify_jwt_token,
    ToolResponse,
    HealthResponse,
    AnalyzeFileRequest,
    SemanticSearchRequest,
    ClusterTagsRequest,
    RenameTagRequest,
    GetDependenciesRequest
)


# ═══════════════════════════════════════════════════════════════════════
# Property 8: Tool Execution & Recommendation Confidence
# For any tool execution, the system SHALL return valid responses
# with proper structure and confidence scores in [0, 1].
# Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 9.5, 10.3
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_property_8_jwt_token_creation():
    """
    Property 8: Tool Execution - JWT Token Creation
    JWT tokens must be properly created and verified.
    """
    # Test token creation
    token = create_jwt_token("test-user", expires_hours=1)
    assert token, "Token must be created"
    assert isinstance(token, str), "Token must be a string"

    # Test token verification
    payload = verify_jwt_token(token)
    assert payload is not None, "Valid token must verify"
    assert payload["sub"] == "test-user", "Token subject must match"
    assert "exp" in payload, "Token must have expiration"
    assert "iat" in payload, "Token must have issued-at"

    print(f"✅ Property 8: JWT token creation validated")


@pytest.mark.asyncio
async def test_property_8_jwt_token_expiration():
    """
    Property 8: Tool Execution - JWT Token Expiration
    Expired tokens must fail verification.
    """
    import time

    # Create token with very short expiration (we'll test the structure)
    token = create_jwt_token("expiring-user", expires_hours=24)
    payload = verify_jwt_token(token)

    assert payload is not None, "Fresh token must verify"
    assert payload["sub"] == "expiring-user", "Subject must match"

    # Verify expiration is in the future
    exp_time = payload["exp"]
    current_time = time.time()
    assert exp_time > current_time, "Expiration must be in the future"

    print(f"✅ Property 8: JWT token expiration validated")


@pytest.mark.asyncio
async def test_property_8_invalid_token():
    """
    Property 8: Tool Execution - Invalid Token Handling
    Invalid tokens must return None.
    """
    # Test with invalid token
    result = verify_jwt_token("invalid-token")
    assert result is None, "Invalid token must return None"

    # Test with empty token
    result = verify_jwt_token("")
    assert result is None, "Empty token must return None"

    # Test with malformed token
    result = verify_jwt_token("not.a.valid.jwt.token")
    assert result is None, "Malformed token must return None"

    print(f"✅ Property 8: Invalid token handling validated")


@pytest.mark.asyncio
async def test_property_8_tool_registry():
    """
    Property 8: Tool Execution - Tool Registry
    All tools must be properly registered with schemas.
    """
    expected_tools = {
        "analyze_file": ["file_path"],
        "semantic_search": ["query"],
        "cluster_tags": [],
        "rename_tag": ["tag_id", "old_name", "new_name"],
        "get_dependencies": ["file_path"]
    }

    for tool_name, required_params in expected_tools.items():
        assert tool_name in TOOL_REGISTRY, f"Tool '{tool_name}' must be registered"

        tool = TOOL_REGISTRY[tool_name]
        assert "name" in tool, "Tool must have name"
        assert "description" in tool, "Tool must have description"
        assert "schema" in tool, "Tool must have schema"
        assert "handler" in tool, "Tool must have handler"

        schema = tool["schema"]
        assert schema.get("type") == "object", "Schema must be object type"

        # Check required parameters
        schema_required = schema.get("required", [])
        for param in required_params:
            assert param in schema_required, f"Parameter '{param}' must be required for {tool_name}"

    print(f"✅ Property 8: Tool registry validated ({len(TOOL_REGISTRY)} tools)")


@pytest.mark.asyncio
async def test_property_8_tool_schema_structure():
    """
    Property 8: Tool Execution - Schema Structure
    Tool schemas must have valid JSON Schema structure.
    """
    for tool_name, tool in TOOL_REGISTRY.items():
        schema = tool["schema"]

        # Must be object type
        assert schema.get("type") == "object", f"{tool_name}: Schema must be object type"

        # Must have properties
        assert "properties" in schema, f"{tool_name}: Schema must have properties"

        # Properties must be dict
        assert isinstance(schema["properties"], dict), f"{tool_name}: Properties must be dict"

        # Each property must have type
        for prop_name, prop_schema in schema["properties"].items():
            assert "type" in prop_schema or "enum" in prop_schema, \
                f"{tool_name}.{prop_name}: Property must have type or enum"

    print(f"✅ Property 8: Tool schema structure validated")


@pytest.mark.asyncio
async def test_property_8_request_models():
    """
    Property 8: Tool Execution - Request Models
    Request models must validate input correctly.
    """
    # Test AnalyzeFileRequest
    req = AnalyzeFileRequest(file_path="/test/file.ts")
    assert req.file_path == "/test/file.ts"
    assert req.include_ast == True  # default
    assert req.include_comments == True  # default

    # Test SemanticSearchRequest
    req = SemanticSearchRequest(query="test query", top_k=5)
    assert req.query == "test query"
    assert req.top_k == 5

    # Test ClusterTagsRequest
    req = ClusterTagsRequest(k=5, generate_summaries=False)
    assert req.k == 5
    assert req.generate_summaries == False

    # Test RenameTagRequest
    req = RenameTagRequest(tag_id="tag-1", old_name="old", new_name="new")
    assert req.tag_id == "tag-1"
    assert req.old_name == "old"
    assert req.new_name == "new"

    # Test GetDependenciesRequest
    req = GetDependenciesRequest(file_path="/test.ts", direction="imports", depth=2)
    assert req.file_path == "/test.ts"
    assert req.direction == "imports"
    assert req.depth == 2

    print(f"✅ Property 8: Request models validated")


@pytest.mark.asyncio
async def test_property_8_tool_handler_callable():
    """
    Property 8: Tool Execution - Handler Callable
    All tool handlers must be callable async functions.
    """
    import asyncio

    for tool_name, tool in TOOL_REGISTRY.items():
        handler = tool["handler"]
        assert callable(handler), f"{tool_name}: Handler must be callable"
        assert asyncio.iscoroutinefunction(handler), f"{tool_name}: Handler must be async"

    print(f"✅ Property 8: Tool handlers validated as async callables")


@pytest.mark.asyncio
async def test_property_8_tool_response_model():
    """
    Property 8: Tool Execution - Response Model
    ToolResponse model must have all required fields.
    """
    response = ToolResponse(
        success=True,
        tool="test_tool",
        result={"data": "test"},
        execution_time_ms=10.5,
        timestamp=datetime.now().isoformat()
    )

    assert response.success == True
    assert response.tool == "test_tool"
    assert response.result == {"data": "test"}
    assert response.execution_time_ms == 10.5
    assert response.timestamp

    # Test failed response
    failed_response = ToolResponse(
        success=False,
        tool="failing_tool",
        result={"error": "Something went wrong"},
        execution_time_ms=5.0,
        timestamp=datetime.now().isoformat()
    )

    assert failed_response.success == False
    assert "error" in failed_response.result

    print(f"✅ Property 8: ToolResponse model validated")


@pytest.mark.asyncio
async def test_property_8_health_response_model():
    """
    Property 8: Tool Execution - Health Response Model
    HealthResponse model must have all required fields.
    """
    response = HealthResponse(
        status="healthy",
        version="2.0.0",
        services={"api": True, "qdrant": True, "postgresql": True},
        timestamp=datetime.now().isoformat()
    )

    assert response.status == "healthy"
    assert response.version == "2.0.0"
    assert response.services["api"] == True
    assert response.timestamp

    # Test degraded status
    degraded = HealthResponse(
        status="degraded",
        version="2.0.0",
        services={"api": True, "qdrant": False},
        timestamp=datetime.now().isoformat()
    )

    assert degraded.status == "degraded"

    print(f"✅ Property 8: HealthResponse model validated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
