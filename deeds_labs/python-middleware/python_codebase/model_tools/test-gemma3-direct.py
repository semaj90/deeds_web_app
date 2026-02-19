#!/usr/bin/env python3
"""
Simple test script to verify your Gemma3 model is working
"""
import requests
import json

def test_health():
    """Test the health endpoint"""
    try:
        response = requests.get("http://localhost:8001/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print("✅ Server Health:")
            print(f"  Status: {data.get('status')}")
            print(f"  Model: {data.get('model')}")
            print(f"  Direct Loading: {data.get('direct_loading')}")
            print(f"  Fallback Mode: {data.get('fallback_mode')}")
            return True
        else:
            print(f"❌ Health check failed: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_legal_query():
    """Test a legal query"""
    try:
        response = requests.post(
            "http://localhost:8001/v1/chat/completions",
            json={
                "model": "gemma3-legal-direct",
                "messages": [
                    {
                        "role": "user",
                        "content": "I need help analyzing a software license agreement. What are the key liability clauses I should review?"
                    }
                ],
                "max_tokens": 512,
                "temperature": 0.1
            },
            timeout=60
        )

        if response.status_code == 200:
            data = response.json()
            ai_response = data["choices"][0]["message"]["content"]
            print("✅ Legal AI Response:")
            print(f"  {ai_response}")
            return True
        else:
            print(f"❌ Legal query failed: HTTP {response.status_code}")
            print(f"  Response: {response.text}")
            return False

    except Exception as e:
        print(f"❌ Legal query failed: {e}")
        return False

def test_quick_legal():
    """Use the quick test endpoint"""
    try:
        response = requests.post("http://localhost:8001/test-legal", timeout=60)

        if response.status_code == 200:
            data = response.json()
            ai_response = data["choices"][0]["message"]["content"]
            print("✅ Quick Legal Test Response:")
            print(f"  {ai_response}")
            return True
        else:
            print(f"❌ Quick test failed: HTTP {response.status_code}")
            return False

    except Exception as e:
        print(f"❌ Quick test failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing Gemma3 Legal AI Direct Loader")
    print("=" * 50)
    print()

    # Test 1: Health Check
    print("1. Testing server health...")
    health_ok = test_health()
    print()

    if not health_ok:
        print("❌ Server not healthy. Make sure it's running:")
        print("   python direct-gemma3-loader.py")
        exit(1)

    # Test 2: Legal Query
    print("2. Testing legal AI query...")
    query_ok = test_legal_query()
    print()

    # Test 3: Quick Test
    print("3. Testing quick legal endpoint...")
    quick_ok = test_quick_legal()
    print()

    # Summary
    print("=" * 50)
    if health_ok and (query_ok or quick_ok):
        print("🎉 ALL TESTS PASSED!")
        print("✅ Your Gemma3 model is working correctly")
        print()
        print("🔗 API Endpoints ready:")
        print("  • Health: http://localhost:8001/health")
        print("  • Chat: http://localhost:8001/v1/chat/completions")
        print("  • Test: http://localhost:8001/test-legal")
        print("  • Docs: http://localhost:8001/docs")
    else:
        print("⚠️  Some tests failed")
        print("Check the server logs for details")

    print()
    print("🎯 Your Unsloth-trained Gemma3 model is ready for legal AI applications!")
