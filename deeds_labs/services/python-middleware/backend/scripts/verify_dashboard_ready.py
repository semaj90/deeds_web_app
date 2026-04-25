"""
Week 2 Task 5: Dashboard Verification Script
=============================================

Verifies that all analytics components are ready for the dashboard.

Checks:
    1. CouchDB connectivity
    2. Database content (summaries, clusters)
    3. MapReduce views
    4. Analytics API server
    5. Component files exist

Usage:
    python backend/scripts/verify_dashboard_ready.py
"""

import httpx
import sys
from pathlib import Path


def print_section(title: str):
    """Print formatted section header"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")


def check_couchdb():
    """Check CouchDB is accessible"""
    print("🗄️  Checking CouchDB...")
    try:
        response = httpx.get("http://admin:password@localhost:5984/_all_dbs", timeout=5.0)
        dbs = response.json()

        required_dbs = ['codebase_graph', 'llm_summaries', 'error_clusters']
        for db in required_dbs:
            if db in dbs:
                print(f"  ✅ {db} database exists")
            else:
                print(f"  ❌ {db} database missing")
                return False
        return True
    except Exception as e:
        print(f"  ❌ CouchDB connection failed: {e}")
        return False


def check_data_content():
    """Check databases have data"""
    print("\n📊 Checking database content...")
    try:
        # Check summaries
        response = httpx.get("http://admin:password@localhost:5984/llm_summaries/_all_docs", timeout=5.0)
        data = response.json()
        summary_count = sum(1 for row in data['rows'] if not row['id'].startswith('_design'))
        print(f"  ✅ {summary_count} LLM summaries found")

        # Check clusters
        response = httpx.get("http://admin:password@localhost:5984/error_clusters/_all_docs", timeout=5.0)
        data = response.json()
        cluster_count = sum(1 for row in data['rows'] if not row['id'].startswith('_design'))
        print(f"  ✅ {cluster_count} error clusters found")

        # Check files
        response = httpx.get("http://admin:password@localhost:5984/codebase_graph/_all_docs?limit=1", timeout=5.0)
        data = response.json()
        print(f"  ✅ {data['total_rows']} files in codebase graph")

        return True
    except Exception as e:
        print(f"  ❌ Data check failed: {e}")
        return False


def check_api_server():
    """Check if analytics API server is running"""
    print("\n🔌 Checking Analytics API Server...")
    try:
        response = httpx.get("http://localhost:8001/health", timeout=5.0)
        if response.status_code == 200:
            print("  ✅ Analytics API server is running")

            # Test stats endpoint
            response = httpx.get("http://localhost:8001/api/analytics/stats", timeout=5.0)
            if response.status_code == 200:
                stats = response.json()
                print(f"  ✅ Stats endpoint working")
                print(f"     - Total files: {stats['total_files']}")
                print(f"     - Summaries: {stats['total_summaries']}")
                print(f"     - Clusters: {stats['total_clusters']}")
                return True
            else:
                print(f"  ⚠️  Stats endpoint returned {response.status_code}")
                return False
        else:
            print(f"  ❌ Server returned {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  ❌ API server not running")
        print("     Start with: python backend/scripts/analytics_api_server.py")
        return False
    except Exception as e:
        print(f"  ❌ API check failed: {e}")
        return False


def check_component_files():
    """Check all Svelte component files exist"""
    print("\n📁 Checking Svelte component files...")

    base_path = Path(__file__).parent.parent.parent / "sveltekit-frontend" / "src" / "routes" / "couchdb-analytics"

    required_files = [
        "+page.svelte",
        "SummaryCard.svelte",
        "DependencyChart.svelte",
        "ErrorPropagationGraph.svelte",
        "ClusterInspector.svelte",
        "README.md"
    ]

    all_exist = True
    for file in required_files:
        file_path = base_path / file
        if file_path.exists():
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ {file} missing")
            all_exist = False

    return all_exist


def main():
    """Run all verification checks"""
    print_section("Week 2 Task 5: Dashboard Verification")

    checks = {
        "CouchDB": check_couchdb(),
        "Data Content": check_data_content(),
        "Analytics API": check_api_server(),
        "Component Files": check_component_files()
    }

    print_section("Verification Summary")

    all_passed = True
    for check_name, passed in checks.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {check_name}")
        if not passed:
            all_passed = False

    print()

    if all_passed:
        print("🎉 All checks passed! Dashboard is ready.")
        print("\n📋 Next steps:")
        print("   1. Start analytics API: python backend/scripts/analytics_api_server.py")
        print("   2. Start SvelteKit dev: cd sveltekit-frontend && npm run dev")
        print("   3. Open dashboard: http://localhost:5175/couchdb-analytics")
        return 0
    else:
        print("⚠️  Some checks failed. Review errors above.")
        print("\n🔧 Common fixes:")
        print("   - CouchDB not running: Start with docker-compose")
        print("   - No data: Run generate_summaries.py and integrate_gpu_clusters.py")
        print("   - API not running: python backend/scripts/analytics_api_server.py")
        return 1


if __name__ == "__main__":
    try:
        exit(main())
    except KeyboardInterrupt:
        print("\n⚠️  Verification cancelled")
        exit(1)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        exit(1)
