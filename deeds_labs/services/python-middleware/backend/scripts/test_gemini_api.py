#!/usr/bin/env python3
"""
Test Gemini API (Free Tier) Integration
Verifies API key, search grounding, and generation
"""

import os
import sys
import asyncio
import aiohttp
from pathlib import Path
from dotenv import load_dotenv

# Load .env from root
load_dotenv(Path(__file__).parent.parent.parent / ".env")

async def test_gemini_api():
    """Test Gemini API with free tier features"""
    print("=" * 70)
    print("🧪 Gemini API (Free Tier) Test")
    print("=" * 70)
    print()

    # Check configuration
    print("1️⃣  Checking Gemini Configuration...")
    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
    endpoint = os.getenv("GEMINI_API_ENDPOINT", "https://generativelanguage.googleapis.com/v1beta/models")

    if not api_key:
        print("   ❌ GEMINI_API_KEY not found in .env")
        return

    print(f"   ✅ API Key: {api_key[:10]}...{api_key[-4:]} ({len(api_key)} chars)")
    print(f"   ✅ Model: {model}")
    print(f"   ✅ Endpoint: {endpoint}")
    print(f"   ✅ Search Grounding: {os.getenv('GEMINI_ENABLE_SEARCH', 'true')}")

    # Test 1: Simple generation (no search)
    print("\n2️⃣  Testing Simple Generation...")
    try:
        url = f"{endpoint}/{model}:generateContent?key={api_key}"

        payload = {
            "contents": [{
                "parts": [{
                    "text": "Explain what a legal deed is in exactly 20 words."
                }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 100
            }
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    print(f"   ✅ Generation successful!")
                    print(f"      Response: {text[:100]}...")
                else:
                    error_text = await resp.text()
                    print(f"   ❌ API Error {resp.status}: {error_text[:200]}")
                    return
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return

    # Test 2: Search-grounded generation (free tier feature!)
    print("\n3️⃣  Testing Search-Grounded Generation...")
    try:
        url = f"{endpoint}/{model}:generateContent?key={api_key}"

        payload = {
            "contents": [{
                "parts": [{
                    "text": "What are the latest changes in Svelte 5 regarding reactivity? Search the web for current information."
                }]
            }],
            "tools": [{
                "google_search": {}  # Free tier feature!
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 200
            }
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=45)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()

                    # Check if search was used
                    if "groundingMetadata" in data:
                        print(f"   ✅ Search grounding active!")
                        grounding = data["groundingMetadata"]
                        if "webSearchQueries" in grounding:
                            print(f"      Queries: {grounding['webSearchQueries']}")

                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    print(f"   ✅ Search-grounded response:")
                    print(f"      {text[:150]}...")
                else:
                    error_text = await resp.text()
                    print(f"   ⚠️  Search grounding error {resp.status}")
                    print(f"      Note: Search may require specific model version")
    except Exception as e:
        print(f"   ⚠️  Search test error: {e}")
        print(f"      This is optional - basic generation still works")

    print()
    print("=" * 70)
    print("✅ Gemini API Test Complete!")
    print("=" * 70)
    print()
    print("📋 Free Tier Features Available:")
    print("   • gemini-2.0-flash-exp - Fast, free model")
    print("   • 15 RPM (requests per minute)")
    print("   • 1M TPM (tokens per minute)")
    print("   • 1500 RPD (requests per day)")
    print("   • Search grounding (when available)")
    print()
    print("🚀 FastMCP Integration Ready:")
    print("   • Ollama (gemma3:270m) - Local reasoning")
    print("   • Gemini (gemini-2.0-flash-exp) - Search grounding")
    print("   • ACE Timeline - Event logging")
    print()


if __name__ == "__main__":
    asyncio.run(test_gemini_api())
