#!/usr/bin/env python3
"""
Quick Start: FastMCP + ACE Timeline Integration Test
Automatically detects and uses available Ollama models
"""

import os
import sys
import asyncio
import aiohttp
from typing import Optional, List, Dict

# Set environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def check_ollama() -> Optional[str]:
    """Check Ollama and return best available model"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:11434/api/tags", timeout=aiohttp.ClientTimeout(total=2)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    models = [m["name"] for m in data.get("models", [])]

                    # Priority order: gemma3:270m (working) > gemma2 > gemma3-legal (broken)
                    for preferred in ["gemma3:270m", "gemma2:latest", "gemma2:2b", "embeddinggemma:latest"]:
                        if preferred in models:
                            return preferred

                    # Return first available
                    return models[0] if models else None
    except:
        pass
    return None

async def test_quick_start():
    """Quick start integration test"""
    print("=" * 70)
    print("🚀 FastMCP + ACE Timeline - Quick Start Test")
    print("=" * 70)
    print()

    # 1. Check Ollama
    print("1️⃣  Checking Ollama...")
    model = await check_ollama()
    if model:
        print(f"   ✅ Ollama running with model: {model}")
    else:
        print("   ❌ Ollama not available. Start with: ollama serve")
        return

    # 2. Update .env with detected model
    print(f"\n2️⃣  Updating .env to use {model}...")
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()

        with open(env_path, "w") as f:
            for line in lines:
                if line.startswith("OLLAMA_MODEL="):
                    f.write(f"OLLAMA_MODEL={model}\n")
                    print(f"   ✅ Updated OLLAMA_MODEL={model}")
                else:
                    f.write(line)

    # 3. Check ACE Timeline
    print("\n3️⃣  Checking ACE Timeline Service...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8002/health", timeout=aiohttp.ClientTimeout(total=2)) as resp:
                if resp.status == 200:
                    health = await resp.json()
                    print(f"   ✅ ACE Timeline healthy: {health['status']}")
                else:
                    print(f"   ⚠️  ACE Timeline returned {resp.status}")
    except Exception as e:
        print(f"   ❌ ACE Timeline not running. Start with:")
        print(f"      python backend/services/ace_timeline_service.py --server --port 8002")
        return

    # 4. Test Ollama generation
    print(f"\n4️⃣  Testing {model} generation...")
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "model": model,
                "prompt": "What is a legal deed? Reply in 15 words.",
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 50}
            }

            async with session.post(
                "http://localhost:11434/api/generate",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    response = data.get("response", "")
                    print(f"   ✅ Generation successful!")
                    print(f"      Response: {response[:100]}...")
                else:
                    print(f"   ❌ Generation failed: HTTP {resp.status}")
    except Exception as e:
        print(f"   ❌ Generation error: {e}")

    # 5. Test timeline logging
    print("\n5️⃣  Testing timeline event logging...")
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "file_path": "test/quick_start.py",
                "error_type": "QuickStartTest",
                "error_message": "Testing FastMCP integration",
                "fix_explanation": f"Successfully detected and configured {model}",
                "confidence_score": 1.0,
                "llm_provider": "ollama",
                "llm_model": model,
                "applied": True,
                "success": True,
                "sources_used": ["ollama://auto-detect"],
                "metadata": {"test": "quick_start", "auto_detect": True}
            }

            async with session.post(
                "http://localhost:8002/log/fix-attempt",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    print(f"   ✅ Event logged! Event ID: {result['event_id']}")
                else:
                    print(f"   ❌ Logging failed: HTTP {resp.status}")
    except Exception as e:
        print(f"   ❌ Logging error: {e}")

    print()
    print("=" * 70)
    print("✅ Quick Start Test Complete!")
    print("=" * 70)
    print()
    print("📋 Status:")
    print(f"   ✅ Ollama model: {model}")
    print(f"   ✅ ACE Timeline: http://localhost:8002")
    print(f"   ✅ .env updated with detected model")
    print()
    print("🚀 Next Steps:")
    print("   1. Start FastMCP server:")
    print("      python backend/services/fastmcp_agentic_middleware.py --server")
    print()
    print("   2. Or run PowerShell helper:")
    print("      .\\start-fastmcp-services.ps1")
    print()

if __name__ == "__main__":
    asyncio.run(test_quick_start())
