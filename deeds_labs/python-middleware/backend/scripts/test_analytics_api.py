"""
Test CouchDB Analytics API Endpoints
=====================================

Week 2 Task 4: Verify all analytics endpoints

Tests:
    GET /api/analytics/stats - Overall statistics
    GET /api/analytics/summaries - List LLM summaries
    GET /api/analytics/summaries/{file_path} - Specific summary
    GET /api/analytics/dependencies - Dependency graph
    GET /api/analytics/file-complexity - Complexity metrics
    GET /api/analytics/error-propagation - Error propagation
    GET /api/analytics/clusters - GPU error clusters

Usage:
    python backend/scripts/test_analytics_api.py
"""

import httpx
import json
import sys
from datetime import datetime


BASE_URL = "http://localhost:8001"


def print_section(title: str):
    """Print formatted section header"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")


def test_endpoint(client: httpx.Client, endpoint: str, params: dict = None):
    """Test a single endpoint and display results"""
    url = f"{BASE_URL}{endpoint}"

    try:
        print(f"🔍 Testing: {endpoint}")
        if params:
            print(f"   Parameters: {params}")

        response = client.get(url, params=params)

        if response.status_code == 200:
            data = response.json()
            print(f"✅ SUCCESS (200 OK)")

            # Pretty print based on endpoint
            if endpoint == "/api/analytics/stats":
                print(f"   Total Files: {data.get('total_files', 0)}")
                print(f"   Total Summaries: {data.get('total_summaries', 0)}")
                print(f"   Total Clusters: {data.get('total_clusters', 0)}")
                print(f"   Files with Errors: {data.get('files_with_errors', 0)}")
                print(f"   Avg Complexity: {data.get('avg_complexity', 0):.2f}")

            elif endpoint == "/api/analytics/summaries":
                print(f"   Summaries Returned: {len(data)}")
                if data:
                    summary = data[0]
                    print(f"   Example: {summary['file_path']}")
                    print(f"            Provider: {summary['llm_provider']}")
                    print(f"            Length: {len(summary['summary'])} chars")

            elif "/api/analytics/summaries/" in endpoint:
                print(f"   File: {data.get('file_path', '')}")
                print(f"   Provider: {data.get('llm_provider', '')}")
                print(f"   Summary: {data.get('summary', '')[:100]}...")
                print(f"   Entities: {', '.join(data.get('key_entities', [])[:5])}")

            elif endpoint == "/api/analytics/dependencies":
                print(f"   Total Imports: {data.get('total_imports', 0)}")
                print(f"   Unique Modules: {data.get('total_unique_modules', 0)}")
                top = data.get('most_imported_files', [])[:5]
                for dep in top:
                    print(f"      • {dep['import_path']}: {dep['import_count']} imports")

            elif endpoint == "/api/analytics/file-complexity":
                print(f"   Files Returned: {len(data)}")
                if data:
                    top3 = data[:3]
                    for file in top3:
                        print(f"      • {file['path']}")
                        print(f"        LOC: {file['lines_of_code']}, Cyclomatic: {file['estimated_cyclomatic']}")

            elif endpoint == "/api/analytics/error-propagation":
                error_files = data.get('error_files', [])
                print(f"   Error Files: {len(error_files)}")
                if error_files:
                    top = error_files[:3]
                    for file in top:
                        print(f"      • {file['file_path']}: {file['error_count']} errors")

            elif endpoint == "/api/analytics/clusters":
                print(f"   Clusters Returned: {len(data)}")
                for cluster in data:
                    print(f"      • {cluster['cluster_id']}: {cluster['cluster_label']}")
                    print(f"        Severity: {cluster['severity']}, Files: {len(cluster['affected_files'])}")

            else:
                print(f"   Response: {json.dumps(data, indent=2)[:200]}...")

        else:
            print(f"❌ FAILED ({response.status_code})")
            print(f"   Error: {response.text}")

        print()

    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}\n")


def main():
    """Run all analytics API tests"""
    print_section("CouchDB Analytics API - Test Suite")
    print(f"Target: {BASE_URL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    with httpx.Client(timeout=30.0) as client:

        # Test 1: Overall Statistics
        print_section("Test 1: Overall Statistics")
        test_endpoint(client, "/api/analytics/stats")

        # Test 2: List All Summaries
        print_section("Test 2: List All Summaries")
        test_endpoint(client, "/api/analytics/summaries", {"limit": 10})

        # Test 3: Summaries by Provider
        print_section("Test 3: Filter by Provider")
        test_endpoint(client, "/api/analytics/summaries", {"provider": "gemma3-legal:latest", "limit": 5})

        # Test 4: Get Specific Summary
        print_section("Test 4: Get Specific Summary")
        # First, get a file path from the list
        response = client.get(f"{BASE_URL}/api/analytics/summaries", params={"limit": 1})
        if response.status_code == 200:
            data = response.json()
            if data:
                file_path = data[0]['file_path']
                test_endpoint(client, f"/api/analytics/summaries/{file_path}")
            else:
                print("⚠️  No summaries found to test individual lookup")

        # Test 5: Dependency Graph
        print_section("Test 5: Dependency Graph Analytics")
        test_endpoint(client, "/api/analytics/dependencies", {"limit": 10})

        # Test 6: File Complexity
        print_section("Test 6: File Complexity Metrics")
        test_endpoint(client, "/api/analytics/file-complexity", {"min_complexity": 5, "limit": 10})

        # Test 7: Error Propagation
        print_section("Test 7: Error Propagation Analysis")
        test_endpoint(client, "/api/analytics/error-propagation", {"limit": 10})

        # Test 8: All Clusters
        print_section("Test 8: GPU Error Clusters (All)")
        test_endpoint(client, "/api/analytics/clusters", {"limit": 50})

        # Test 9: Clusters by Severity
        print_section("Test 9: Filter Clusters by Severity (Error)")
        test_endpoint(client, "/api/analytics/clusters", {"severity": "error", "limit": 20})

        # Test 10: Clusters by Severity (Warning)
        print_section("Test 10: Filter Clusters by Severity (Warning)")
        test_endpoint(client, "/api/analytics/clusters", {"severity": "warning", "limit": 20})

    print_section("Test Suite Complete!")
    print("✅ All endpoints tested")
    print("📊 Review results above for any failures\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        sys.exit(1)
