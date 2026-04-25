#!/usr/bin/env python3
"""
Phase 89: Test FastAPI Endpoints
Quick validation of all API endpoints
"""

import asyncio
import httpx
import json

BASE_URL = "http://127.0.0.1:8090"

async def test_health():
    """Test /health endpoint"""
    print("\n1️⃣  Testing GET /health...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/health", timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Status: {data.get('status')}")
                print(f"   ✅ CUDA: {data.get('cuda_available')}")
                print(f"   ✅ Redis: {data.get('services', {}).get('redis')}")
                print(f"   ✅ Qdrant: {data.get('services', {}).get('qdrant')}")
                return True
            else:
                print(f"   ❌ Status: {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return False

async def test_stats():
    """Test /stats endpoint"""
    print("\n2️⃣  Testing GET /stats...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/stats", timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Redis keys: {data.get('redis_keys')}")
                print(f"   ✅ Cached embeddings: {data.get('cached_embeddings')}")
                print(f"   ✅ Qdrant points: {data.get('qdrant_points')}")
                return True
            else:
                print(f"   ❌ Status: {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return False

async def test_mcp_tools():
    """Test /mcp/tools endpoint"""
    print("\n3️⃣  Testing GET /mcp/tools...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{BASE_URL}/mcp/tools", timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                tools = data.get('tools', [])
                print(f"   ✅ Found {len(tools)} tools:")
                for tool in tools:
                    print(f"      - {tool['name']}: {tool['description']}")
                return True
            else:
                print(f"   ❌ Status: {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return False

async def test_query():
    """Test POST /query endpoint"""
    print("\n4️⃣  Testing POST /query...")
    async with httpx.AsyncClient() as client:
        try:
            payload = {
                "query": "TS1005 comma expected error",
                "top_k": 5,
                "use_cuda": False  # Use CPU for now
            }
            response = await client.post(
                f"{BASE_URL}/query",
                json=payload,
                timeout=30.0
            )
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Query: {data.get('query')}")
                print(f"   ✅ Results: {len(data.get('results', []))}")
                print(f"   ✅ Time: {data.get('total_time_ms'):.2f}ms")
                print(f"   ✅ CUDA used: {data.get('cuda_used')}")
                if data.get('results'):
                    print(f"   ✅ Top result score: {data['results'][0]['score']:.4f}")
                return True
            else:
                print(f"   ❌ Status: {response.status_code}")
                print(f"   ❌ Response: {response.text}")
                return False
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return False

async def main():
    print("\n🧪 Phase 89: FastAPI Endpoint Tests")
    print("=" * 50)

    # Check if server is running
    try:
        async with httpx.AsyncClient() as client:
            await client.get(f"{BASE_URL}/health", timeout=2.0)
    except:
        print("\n❌ Server not running at", BASE_URL)
        print("   Start with: python scripts/phase89-fastapi-server.py")
        return

    results = []

    # Run tests
    results.append(("Health Check", await test_health()))
    results.append(("Statistics", await test_stats()))
    results.append(("MCP Tools", await test_mcp_tools()))
    results.append(("Query Search", await test_query()))

    # Summary
    print("\n" + "=" * 50)
    print("📊 Test Summary:")
    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✅" if result else "❌"
        print(f"   {status} {name}")

    print(f"\n   Passed: {passed}/{total}")

    if passed == total:
        print("\n✅ All tests passed!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    asyncio.run(main())
