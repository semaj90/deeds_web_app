"""Check codebase graph contents"""
from services.couchdb_client import get_couchdb_client

client = get_couchdb_client()

# Get first 5 files from codebase_graph
count = 0
for doc_id in client.codebase_graph:
    if doc_id.startswith('_'):
        continue
    if count >= 5:
        break
    doc = client.codebase_graph[doc_id]
    file_path = doc.get("path", "unknown")
    metadata = doc.get("metadata", {})
    language = metadata.get("language", "?")
    loc = metadata.get("lines_of_code", 0)
    print(f"{count+1}. {file_path[-70:]}")
    print(f"   Language: {language}, LOC: {loc}, Functions: {len(doc.get('functions', []))}")
    count += 1

print(f"\nTotal documents: {client.codebase_graph.info()['doc_count']}")
