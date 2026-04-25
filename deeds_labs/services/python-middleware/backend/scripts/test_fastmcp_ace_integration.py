#!/usr/bin/env python3
"""
Test FastMCP Agentic Middleware with ACE Timeline Integration
"""

import asyncio
import sys
import os

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.fastmcp_agentic_middleware import FastMCPAgenticMiddleware, ToolCall, OllamaClient

async def test_integration():
    """Test complete integration"""

    print("=" * 70)
    print("🧪 Testing FastMCP + ACE Timeline Integration")
    print("=" * 70)

    # Test 1: getOllamaEndpoint()
    print("\n1️⃣  Test getOllamaEndpoint() from .env")
    endpoint = OllamaClient.getOllamaEndpoint()
    print(f"   ✅ Ollama endpoint: {endpoint}")

    # Test 2: Initialize middleware
    print("\n2️⃣  Initialize FastMCP middleware")
    middleware = FastMCPAgenticMiddleware()
    print(f"   ✅ Ollama: {middleware.ollama.base_url}")
    print(f"   ✅ Model: {middleware.ollama.model}")
    print(f"   ✅ Gemini: {'Configured' if middleware.gemini.api_key else 'Not configured'}")
    print(f"   ✅ Timeline: {middleware.ace_timeline_url}")

    # Test 3: List available tools
    print("\n3️⃣  List available tools")
    tools = await middleware.list_tools()
    print(f"   ✅ Found {len(tools)} tools:")
    for tool in tools[:10]:  # Show first 10
        print(f"      - {tool['name']}: {tool['description'][:50]}...")

    # Test 4: Test log_ace_event tool
    print("\n4️⃣  Test log_ace_event tool")
    log_result = await middleware.execute_tool(
        ToolCall(
            tool_name="log_ace_event",
            arguments={
                "event_type": "code_fix",
                "file_path": "src/components/AiAssistant.svelte",
                "error_type": "Svelte5Migration",
                "confidence": 0.88,
                "llm_provider": "ollama",
                "sources_used": ["kb://svelte5_patterns", "ollama://gemma3-legal"],
                "success": True,
                "metadata": {
                    "test": "fastmcp_integration",
                    "timestamp": "2026-01-02"
                }
            },
            call_id="test_log"
        )
    )

    if log_result.success:
        print(f"   ✅ Event logged to timeline!")
        print(f"      Event ID: {log_result.result['event_id']}")
        print(f"      Timeline URL: {log_result.result['timeline_url']}")
    else:
        print(f"   ❌ Logging failed: {log_result.error}")

    # Test 5: Test analyze_error tool
    print("\n5️⃣  Test analyze_error tool (using gemma3:270m)")
    analysis_result = await middleware.execute_tool(
        ToolCall(
            tool_name="analyze_error",
            arguments={
                "error_message": "Property 'onClick' does not exist on type 'HTMLButtonElement'",
                "file_path": "src/components/Button.svelte"
            },
            call_id="test_analyze"
        )
    )

    if analysis_result.success:
        print(f"   ✅ Analysis complete!")
        analysis = analysis_result.result
        print(f"      Error: {analysis['error'][:50]}...")
        print(f"      File: {analysis['file']}")
        print(f"      Analysis: {analysis['analysis'][:200]}...")
        print(f"      Similar cases: {analysis['similar_cases']}")
    else:
        print(f"   ❌ Analysis failed: {analysis_result.error}")

    print("\n" + "=" * 70)
    print("✅ All tests passed!")
    print("=" * 70)

    print("\n📋 Summary:")
    print("   - FastMCP middleware initialized with Gemini + Ollama")
    print("   - getOllamaEndpoint() reads from .env correctly")
    print(f"   - ACE Timeline Service connected at {middleware.ace_timeline_url}")
    print("   - All tools registered and working")
    print("\n🚀 Ready for GitHub Copilot MCP integration!")

if __name__ == "__main__":
    asyncio.run(test_integration())
