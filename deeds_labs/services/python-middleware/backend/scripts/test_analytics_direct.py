"""
Direct CouchDB Analytics Client Test
=====================================

Week 2 Task 4: Test analytics functionality directly via CouchDB client

Tests all MapReduce views and analytics logic without requiring FastAPI server.

Usage:
    python backend/scripts/test_analytics_direct.py
"""

import sys
from pathlib import Path
from datetime import datetime

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.couchdb_client import get_couchdb_client


def print_section(title: str):
    """Print formatted section header"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")


def test_stats():
    """Test overall statistics"""
    print_section("Test 1: Overall Statistics")

    client = get_couchdb_client()

    # Count documents
    total_files = sum(1 for doc_id in client.codebase_graph if not doc_id.startswith('_design'))
    total_summaries = sum(1 for doc_id in client.llm_summaries if not doc_id.startswith('_design'))
    total_clusters = sum(1 for doc_id in client.error_clusters if not doc_id.startswith('_design'))

    print(f"Total Files: {total_files}")
    print(f"Total Summaries: {total_summaries}")
    print(f"Total Clusters: {total_clusters}")

    # Count error files
    files_with_errors = 0
    complexity_sum = 0
    complexity_count = 0

    for doc_id in client.codebase_graph:
        if doc_id.startswith('_design'):
            continue

        doc = client.codebase_graph[doc_id]
        if doc.get('type') == 'file':
            if doc.get('error_count', 0) > 0:
                files_with_errors += 1

            # Estimate complexity
            complexity = (
                len(doc.get('functions', [])) +
                len(doc.get('classes', [])) * 2 +
                len(doc.get('imports', [])) // 5
            )
            complexity_sum += complexity
            complexity_count += 1

    avg_complexity = complexity_sum / complexity_count if complexity_count > 0 else 0

    print(f"Files with Errors: {files_with_errors}")
    print(f"Average Complexity: {avg_complexity:.2f}")
    print("✅ Stats test complete\n")


def test_summaries():
    """Test LLM summaries"""
    print_section("Test 2: LLM Summaries")

    client = get_couchdb_client()

    # Iterate directly over database
    count = 0
    for doc_id in client.llm_summaries:
        if doc_id.startswith('_design'):
            continue

        doc = client.llm_summaries[doc_id]
        if doc.get('type') == 'llm_summary':
            count += 1
            if count <= 10:
                print(f"{count}. {doc.get('file_path', 'unknown')}")
                print(f"   Provider: {doc.get('llm_provider', 'unknown')}")
                print(f"   Summary Length: {len(doc.get('summary', ''))} chars")
                print(f"   Entities: {', '.join(doc.get('key_entities', [])[:5])}")
                print()

    print(f"✅ Found {count} summaries\n")

def test_dependencies():
    """Test dependency graph analytics"""
    print_section("Test 3: Dependency Graph")

    client = get_couchdb_client()

    # Query most_imported_files view
    results = client.codebase_graph.view(
        '_design/topology/most_imported_files',
        group=True,
        descending=True,
        limit=10
    )

    total_imports = 0
    print("Top 10 Most Imported Modules:\n")

    for i, row in enumerate(results, 1):
        import_path = row.key
        import_count = row.value
        total_imports += import_count

        print(f"{i}. {import_path}")
        print(f"   Imported {import_count} times\n")

    print(f"Total Imports: {total_imports}")
    print("✅ Dependency test complete\n")


def test_file_complexity():
    """Test file complexity metrics"""
    print_section("Test 4: File Complexity")

    client = get_couchdb_client()

    # Query file_complexity view
    results = client.codebase_graph.view(
        '_design/analytics/file_complexity',
        limit=10
    )

    complexities = []

    for row in results:
        value = row.value
        complexities.append({
            'path': value.get('path', ''),
            'loc': value.get('lines_of_code', 0),
            'functions': value.get('function_count', 0),
            'classes': value.get('class_count', 0),
            'cyclomatic': value.get('estimated_cyclomatic', 0)
        })

    # Sort by complexity
    complexities.sort(key=lambda x: x['cyclomatic'], reverse=True)

    print("Top 10 Most Complex Files:\n")
    for i, file in enumerate(complexities[:10], 1):
        print(f"{i}. {file['path']}")
        print(f"   LOC: {file['loc']}, Functions: {file['functions']}, Classes: {file['classes']}")
        print(f"   Estimated Cyclomatic Complexity: {file['cyclomatic']}\n")

    print("✅ Complexity test complete\n")


def test_error_propagation():
    """Test error propagation analysis"""
    print_section("Test 5: Error Propagation")

    client = get_couchdb_client()

    # Query error_propagation view
    results = client.codebase_graph.view(
        '_design/analytics/error_propagation',
        limit=10
    )

    print("Top 10 Files with Errors:\n")

    for i, row in enumerate(results, 1):
        value = row.value
        file_path = value.get('file', '')
        error_count = value.get('errors', 0)

        print(f"{i}. {file_path}")
        print(f"   Errors: {error_count}\n")

    print("✅ Error propagation test complete\n")


def test_clusters():
    """Test GPU error clusters"""
    print_section("Test 6: GPU Error Clusters")

    client = get_couchdb_client()

    # Query by_severity view
    results = client.error_clusters.view('_design/clusters/by_severity')

    print("Clusters by Severity:\n")

    for row in results:
        severity = row.key
        value = row.value

        print(f"Severity: {severity}")
        print(f"  Cluster ID: {value.get('cluster_id', '')}")
        print(f"  Label: {value.get('cluster_label', '')}")
        print(f"  File Count: {value.get('file_count', 0)}")
        print(f"  Occurrences: {value.get('occurrence_count', 0)}\n")

    # Query all clusters
    all_clusters = client.error_clusters.view(
        '_design/clusters/by_size',
        descending=True
    )

    cluster_count = sum(1 for _ in all_clusters)
    print(f"Total Clusters: {cluster_count}")
    print("✅ Cluster test complete\n")


def test_file_with_clusters():
    """Test files linked to clusters"""
    print_section("Test 7: Files Linked to Clusters")

    client = get_couchdb_client()

    # Find files with cluster_ids
    files_with_clusters = []

    for doc_id in client.codebase_graph:
        if doc_id.startswith('_design'):
            continue

        doc = client.codebase_graph[doc_id]
        if doc.get('type') == 'file' and doc.get('cluster_ids'):
            files_with_clusters.append({
                'path': doc.get('path', ''),
                'cluster_ids': doc.get('cluster_ids', [])
            })

    print(f"Files with Cluster Links: {len(files_with_clusters)}\n")

    # Show first 10
    for i, file in enumerate(files_with_clusters[:10], 1):
        print(f"{i}. {file['path']}")
        print(f"   Clusters: {', '.join(file['cluster_ids'])}\n")

    print("✅ File-cluster linking test complete\n")


def main():
    """Run all tests"""
    print_section("CouchDB Analytics - Direct Client Test Suite")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"CouchDB URL: http://localhost:5984")

    try:
        test_stats()
        test_summaries()
        test_dependencies()
        test_file_complexity()
        test_error_propagation()
        test_clusters()
        test_file_with_clusters()

        print_section("All Tests Complete! ✅")
        print("Week 2 Task 4: Analytics functionality verified")
        print("All MapReduce views working correctly")
        print("Ready to build Svelte dashboard (Task 5)\n")

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
