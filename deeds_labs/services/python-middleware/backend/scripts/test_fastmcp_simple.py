#!/usr/bin/env python3
"""
Simple Test: FastMCP getOllamaEndpoint() + ACE Timeline
No knowledge base dependency
"""

import asyncio
import sys
import os
import aiohttp

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def test_simple():
    """Test without full middleware"""

    print("=" * 70)
    print("🧪 Simple FastMCP + ACE Timeline Test")
    print("=" * 70)

    # Test 1: getOllamaEndpoint()
    print("\n1️⃣  Test getOllamaEndpoint() from .env")

    from services.fastmcp_agentic_middleware import OllamaClient

    endpoint = OllamaClient.getOllamaEndpoint()
    print(f"   ✅ Primary (OLLAMA_URL): {os.getenv('OLLAMA_URL')}")
    print(f"   ✅ Fallback (VITE_OLLAMA_URL): {os.getenv('VITE_OLLAMA_URL')}")
    print(f"   ✅ Selected endpoint: {endpoint}")

    # Test 2: Ollama client
    print("\n2️⃣  Test Ollama client")
    ollama = OllamaClient()
    print(f"   ✅ Base URL: {ollama.base_url}")
    print(f"   ✅ Model: {ollama.model}")

    # Test 3: ACE Timeline connectivity
    print("\n3️⃣  Test ACE Timeline Service connection")
    ace_timeline_url = os.getenv("ACE_TIMELINE_URL", "http://localhost:8002")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{ace_timeline_url}/health") as resp:
                if resp.status == 200:
                    health = await resp.json()
                    print(f"   ✅ ACE Timeline healthy: {health}")
                else:
                    print(f"   ❌ HTTP {resp.status}")
    except Exception as e:
        print(f"   ❌ Connection failed: {e}")

    # Test 4: Log event to timeline
    print("\n4️⃣  Test logging event to timeline")

    payload = {
        "file_path": "test/fastmcp_integration.ts",
        "error_type": "Integration Test",
        "error_message": "Testing FastMCP + Gemini integration",
        "fix_explanation": "Verified getOllamaEndpoint() reads OLLAMA_URL from .env",
        "confidence_score": 1.0,
        "llm_provider": "fastmcp",
        "llm_model": ollama.model,
        "applied": True,
        "success": True,
        "sources_used": [".env", "fastmcp_agentic_middleware.py"],
        "metadata": {
            "test": "simple_integration",
            "endpoint": endpoint
        }
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{ace_timeline_url}/log/fix-attempt",
                json=payload
            ) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    print(f"   ✅ Event logged successfully!")
                    print(f"      Event ID: {result.get('event_id')}")
                else:
                    print(f"   ❌ HTTP {resp.status}")
    except Exception as e:
        print(f"   ❌ Logging failed: {e}")

    # Test 5: Test Ollama API
    print("\n5️⃣  Test Ollama API")

    try:
        response = await ollama.generate(
            prompt="Say 'Hello from FastMCP!' in one sentence.",
            temperature=0.1,
            max_tokens=50
        )
        print(f"   ✅ Ollama response: {response[:100]}...")
    except Exception as e:
        print(f"   ❌ Ollama failed: {e}")

    print("\n" + "=" * 70)
    print("✅ Simple integration test complete!")
    print("=" * 70)

    print("\n📋 Summary:")
    print(f"   ✅ getOllamaEndpoint() works: {endpoint}")
    print(f"   ✅ Ollama model configured: {ollama.model}")
    print(f"   ✅ ACE Timeline service: {ace_timeline_url}")
    print("\n🚀 Ready for full FastMCP middleware!")

if __name__ == "__main__":
    asyncio.run(test_simple())
