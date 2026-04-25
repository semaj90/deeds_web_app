#!/usr/bin/env python3
"""
CouchDB Setup Script
Initializes databases and creates MapReduce views for graph analysis.
"""

import sys
import os
import json
import requests
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.couchdb_client import get_couchdb_client


COUCHDB_URL = os.getenv("COUCHDB_URL", "http://admin:password@localhost:5984")


def check_couchdb_health():
    """Verify CouchDB is running"""
    try:
        response = requests.get(f"{COUCHDB_URL}/_up", timeout=5)
        if response.status_code == 200:
            print("✅ CouchDB is running")
            return True
        else:
            print(f"❌ CouchDB health check failed: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to CouchDB. Is it running?")
        print(f"   URL: {COUCHDB_URL}")
        print("\n   Start with: docker start phase89-couchdb")
        return False


def create_design_docs():
    """Create MapReduce design documents"""

    client = get_couchdb_client()

    # Design doc for codebase topology
    topology_design = {
        "_id": "_design/topology",
        "language": "javascript",
        "views": {
            "by_error_count": {
                "map": """
                function(doc) {
                    if (doc.type === 'file' && doc.error_count > 0) {
                        emit(doc.error_count, {
                            path: doc.path,
                            errors: doc.error_count,
                            classes: doc.classes,
                            functions: doc.functions
                        });
                    }
                }
                """
            },
            "by_import_count": {
                "map": """
                function(doc) {
                    if (doc.type === 'file' && doc.imports) {
                        emit(doc.imports.length, doc.path);
                    }
                }
                """
            },
            "most_imported_files": {
                "map": """
                function(doc) {
                    if (doc.type === 'file' && doc.imports) {
                        doc.imports.forEach(function(imp) {
                            emit(imp, doc.path);
                        });
                    }
                }
                """,
                "reduce": "_count"
            },
            "dependency_graph": {
                "map": """
                function(doc) {
                    if (doc.type === 'file' && doc.imports) {
                        doc.imports.forEach(function(imp) {
                            emit(imp, doc.path);
                        });
                    }
                }
                """,
                "reduce": "_count"
            }
        }
    }

    # Save design doc
    if "_design/topology" in client.codebase_graph:
        existing = client.codebase_graph["_design/topology"]
        topology_design["_rev"] = existing["_rev"]

    client.codebase_graph.save(topology_design)
    print("✅ Created design doc: _design/topology")

    # Design doc for LLM summaries
    summaries_design = {
        "_id": "_design/summaries",
        "language": "javascript",
        "views": {
            "by_file": {
                "map": """
                function(doc) {
                    if (doc.type === 'llm_summary') {
                        emit(doc.file_path, doc.summary);
                    }
                }
                """
            },
            "by_provider": {
                "map": """
                function(doc) {
                    if (doc.type === 'llm_summary') {
                        emit(doc.llm_provider, 1);
                    }
                }
                """,
                "reduce": "_count"
            }
        }
    }

    if "_design/summaries" in client.llm_summaries:
        existing = client.llm_summaries["_design/summaries"]
        summaries_design["_rev"] = existing["_rev"]

    client.llm_summaries.save(summaries_design)
    print("✅ Created design doc: _design/summaries")

    # Design doc for analytics
    analytics_design = {
        "_id": "_design/analytics",
        "language": "javascript",
        "views": {
            "file_complexity": {
                "map": """
                function(doc) {
                    if (doc.type === 'file') {
                        var complexity = {
                            path: doc.path,
                            lines_of_code: doc.metadata ? doc.metadata.lines_of_code : 0,
                            function_count: doc.functions ? doc.functions.length : 0,
                            class_count: doc.classes ? doc.classes.length : 0,
                            import_count: doc.imports ? doc.imports.length : 0,
                            error_count: doc.error_count || 0
                        };
                        // Estimated cyclomatic complexity: functions + classes * 2 + imports / 5
                        complexity.estimated_cyclomatic =
                            complexity.function_count +
                            (complexity.class_count * 2) +
                            Math.floor(complexity.import_count / 5);

                        emit(doc.path, complexity);
                    }
                }
                """
            },
            "error_propagation": {
                "map": """
                function(doc) {
                    if (doc.type === 'file' && doc.error_count > 0) {
                        // Emit files that import this error file
                        emit(doc.path, {
                            file: doc.path,
                            errors: doc.error_count,
                            imported_by: []
                        });
                    }
                }
                """
            }
        }
    }

    if "_design/analytics" in client.codebase_graph:
        existing = client.codebase_graph["_design/analytics"]
        analytics_design["_rev"] = existing["_rev"]

    client.codebase_graph.save(analytics_design)
    print("✅ Created design doc: _design/analytics")

    # Design doc for error clusters
    clusters_design = {
        "_id": "_design/clusters",
        "language": "javascript",
        "views": {
            "by_severity": {
                "map": """
                function(doc) {
                    if (doc.type === 'error_cluster') {
                        emit(doc.severity, {
                            cluster_id: doc.cluster_id,
                            label: doc.cluster_label,
                            file_count: doc.affected_files ? doc.affected_files.length : 0,
                            occurrence_count: doc.occurrence_count
                        });
                    }
                }
                """
            },
            "by_size": {
                "map": """
                function(doc) {
                    if (doc.type === 'error_cluster') {
                        var file_count = doc.affected_files ? doc.affected_files.length : (doc.member_files ? doc.member_files.length : 0);
                        emit(file_count, {
                            cluster_id: doc.cluster_id,
                            label: doc.cluster_label,
                            file_count: file_count,
                            severity: doc.severity
                        });
                    }
                }
                """
            },
            "by_label": {
                "map": """
                function(doc) {
                    if (doc.type === 'error_cluster') {
                        emit(doc.cluster_label, doc.cluster_id);
                    }
                }
                """
            }
        }
    }

    if "_design/clusters" in client.error_clusters:
        existing = client.error_clusters["_design/clusters"]
        clusters_design["_rev"] = existing["_rev"]

    client.error_clusters.save(clusters_design)
    print("✅ Created design doc: _design/clusters")


def print_stats():
    """Print database statistics"""
    client = get_couchdb_client()
    stats = client.health_check()

    print("\n📊 Database Statistics:")
    print("═" * 50)
    print(f"CouchDB Version: {stats['version']}")
    print()

    for db_name, db_stats in stats['databases'].items():
        print(f"{db_name}:")
        print(f"  - Documents: {db_stats['doc_count']}")
        print(f"  - Status: {'✅ Active' if db_stats['exists'] else '❌ Missing'}")

    print("═" * 50)


def main():
    print("🚀 CouchDB Setup for RAG + Graph Analysis")
    print("═" * 50)
    print()

    # Step 1: Health check
    if not check_couchdb_health():
        sys.exit(1)

    print()

    # Step 2: Initialize client (creates databases)
    print("📦 Initializing databases...")
    client = get_couchdb_client()
    print("✅ Databases initialized")
    print()

    # Step 3: Create design documents
    print("📝 Creating MapReduce views...")
    create_design_docs()
    print()

    # Step 4: Print stats
    print_stats()

    print()
    print("✅ Setup complete!")
    print()
    print("Next steps:")
    print("  1. Run codebase indexer: python backend/scripts/index_codebase.py")
    print("  2. Generate LLM summaries: python backend/scripts/generate_summaries.py")
    print("  3. View Fauxton UI: http://localhost:5984/_utils")


if __name__ == "__main__":
    main()
