#!/usr/bin/env python3
"""
Smoke Test Suite for TensorRT-LLM Legal AI Production Stack
Verifies all components are working correctly after deployment
"""

import requests
import json
import time
import sys
from typing import Dict, Any

# Test configuration
BASE_URL = "http://localhost:8090"
TESTS = []

def test_result(name: str, success: bool, details: str = ""):
    """Record test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {name}")
    if details:
        print(f"    {details}")
    TESTS.append({"name": name, "success": success, "details": details})
    return success

def test_health_endpoint():
    """Test unified health endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}, Response: {response.text[:100]}"
        return test_result("Health Endpoint", success, details)
    except Exception as e:
        return test_result("Health Endpoint", False, f"Error: {e}")

def test_tensorrt_inference():
    """Test TensorRT-LLM legal inference"""
    query_data = {
        "query": "What is consideration in contract law?",
        "document_type": "contract",
        "jurisdiction": "US",
        "max_results": 5
    }

    try:
        response = requests.post(
            f"{BASE_URL}/api/legal/query",
            json=query_data,
            timeout=60
        )

        if response.status_code == 200:
            data = response.json()
            has_answer = "answer" in data and len(data["answer"]) > 50
            has_sources = "sources" in data
            has_confidence = "confidence" in data

            success = has_answer and has_sources and has_confidence
            details = f"Answer length: {len(data.get('answer', ''))}, Sources: {len(data.get('sources', []))}, Confidence: {data.get('confidence', 0)}"
        else:
            success = False
            details = f"HTTP {response.status_code}: {response.text[:200]}"

        return test_result("TensorRT-LLM Inference", success, details)
    except Exception as e:
        return test_result("TensorRT-LLM Inference", False, f"Error: {e}")

def test_ollama_fallback():
    """Test Ollama fallback endpoint"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/legal/ollama/generate",
            json={
                "model": "gemma3-legal:latest",
                "prompt": "Define breach of contract",
                "stream": False
            },
            timeout=30
        )

        success = response.status_code == 200
        if success:
            data = response.json()
            has_response = "response" in data and len(data["response"]) > 20
            success = has_response
            details = f"Response length: {len(data.get('response', ''))}"
        else:
            details = f"HTTP {response.status_code}: {response.text[:200]}"

        return test_result("Ollama Fallback", success, details)
    except Exception as e:
        return test_result("Ollama Fallback", False, f"Error: {e}")

def test_metrics_endpoint():
    """Test metrics and monitoring"""
    try:
        response = requests.get(f"{BASE_URL}/metrics", timeout=10)
        success = response.status_code == 200

        if success:
            data = response.json()
            has_documents = "documents" in data
            has_gpu_info = "gpu_memory" in data
            details = f"Documents: {data.get('documents', 'N/A')}, GPU Memory: {data.get('gpu_memory', 'N/A')}"
        else:
            details = f"HTTP {response.status_code}: {response.text[:200]}"

        return test_result("Metrics Endpoint", success, details)
    except Exception as e:
        return test_result("Metrics Endpoint", False, f"Error: {e}")

def test_performance_benchmark():
    """Basic performance test"""
    queries = [
        "What is a contract?",
        "Define tort law",
        "Explain breach of contract",
        "What is consideration?",
        "Define negligence"
    ]

    start_time = time.time()
    successful_queries = 0

    for i, query in enumerate(queries):
        try:
            response = requests.post(
                f"{BASE_URL}/api/legal/query",
                json={"query": query, "max_results": 3},
                timeout=30
            )
            if response.status_code == 200:
                successful_queries += 1
            print(f"    Query {i+1}/5: {'✓' if response.status_code == 200 else '✗'}")
        except:
            print(f"    Query {i+1}/5: ✗")

    total_time = time.time() - start_time
    avg_time = total_time / len(queries)
    success = successful_queries >= 3  # At least 60% success rate

    details = f"Success: {successful_queries}/{len(queries)}, Avg time: {avg_time:.2f}s"
    return test_result("Performance Benchmark", success, details)

def test_concurrent_requests():
    """Test concurrent request handling"""
    import threading
    import queue

    def worker(q, query_num):
        try:
            response = requests.post(
                f"{BASE_URL}/api/legal/query",
                json={"query": f"Test query {query_num}", "max_results": 1},
                timeout=20
            )
            q.put(response.status_code == 200)
        except:
            q.put(False)

    q = queue.Queue()
    threads = []

    # Start 3 concurrent requests
    for i in range(3):
        t = threading.Thread(target=worker, args=(q, i))
        t.start()
        threads.append(t)

    # Wait for completion
    for t in threads:
        t.join()

    # Check results
    successes = 0
    while not q.empty():
        if q.get():
            successes += 1

    success = successes >= 2  # At least 2/3 concurrent requests succeed
    details = f"Concurrent successes: {successes}/3"
    return test_result("Concurrent Requests", success, details)

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("SMOKE TEST SUMMARY")
    print("="*60)

    passed = sum(1 for test in TESTS if test["success"])
    total = len(TESTS)

    print(f"Tests Passed: {passed}/{total}")
    print(f"Success Rate: {(passed/total)*100:.1f}%")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Production system is ready!")
        print("\nNext steps:")
        print("1. Deploy to production environment")
        print("2. Configure monitoring and alerting")
        print("3. Set up backup and disaster recovery")
        print("4. Implement authentication and authorization")
    else:
        print(f"\n⚠️  {total-passed} tests failed - Review configuration")
        print("\nFailed tests:")
        for test in TESTS:
            if not test["success"]:
                print(f"  - {test['name']}: {test['details']}")

    return passed == total

def main():
    """Run all smoke tests"""
    print("🧪 TensorRT-LLM Legal AI Stack - Smoke Test Suite")
    print("="*60)
    print(f"Testing endpoint: {BASE_URL}")
    print()

    # Core functionality tests
    test_health_endpoint()
    test_tensorrt_inference()
    test_ollama_fallback()
    test_metrics_endpoint()

    # Performance tests
    test_performance_benchmark()
    test_concurrent_requests()

    # Print summary
    all_passed = print_summary()

    # Exit with appropriate code
    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()