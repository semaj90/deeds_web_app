"""Quick check of CouchDB status"""
from services.couchdb_client import get_couchdb_client

client = get_couchdb_client()

# Check codebase database
info = client.codebase_graph.info()
print(f"Codebase Graph DB: {info['doc_count']} documents")

# Check LLM summaries database
info2 = client.llm_summaries.info()
print(f"LLM Summaries DB: {info2['doc_count']} documents")

# Check error clusters database
info3 = client.error_clusters.info()
print(f"Error Clusters DB: {info3['doc_count']} documents")

# Sample query
hotspots = client.query_error_hotspots(limit=3)
print(f"\nTop 3 Error Hotspots:")
for h in hotspots:
    print(f"  - {h.get('file_path', 'unknown')}: {h.get('error_count', 0)} errors")