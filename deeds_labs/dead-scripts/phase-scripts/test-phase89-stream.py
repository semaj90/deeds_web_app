#!/usr/bin/env python3
"""
Phase 89: Test SSE Streaming
Test Server-Sent Events streaming from /query/stream endpoint
"""

import httpx
import json

async def test_stream():
    """Test streaming query"""
    print("\n🌊 Testing POST /query/stream (SSE)")
    print("=" * 60)

    payload = {
        "query": "Svelte 5 runes state management",
        "top_k": 10,
        "stream": True
    }

    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            "http://127.0.0.1:8090/query/stream",
            json=payload,
            timeout=30.0
        ) as response:
            print(f"📡 Connection: {response.status_code}")
            print(f"📋 Content-Type: {response.headers.get('content-type')}")
            print("\n📦 Streaming chunks:\n")

            chunk_count = 0
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    chunk_count += 1
                    data = json.loads(line[6:])  # Remove "data: " prefix

                    if data.get("status") == "searching":
                        print(f"   🔍 Searching for: {data.get('query')}")
                    elif data.get("status") == "complete":
                        print(f"\n   ✅ Complete: {data.get('total')} results")
                    else:
                        idx = data.get("index", "?")
                        score = data.get("score", 0)
                        file = data.get("file", "unknown")
                        text_preview = data.get("text", "")[:100]
                        print(f"   {idx+1}. Score: {score:.4f}")
                        print(f"      File: {file}")
                        print(f"      Preview: {text_preview}...")
                        print()

            print(f"📊 Received {chunk_count} SSE events")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_stream())
