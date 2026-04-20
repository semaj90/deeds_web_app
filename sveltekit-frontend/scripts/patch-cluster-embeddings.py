"""
patch-cluster-embeddings.py

Fills missing summary_embedding values for cluster_summaries rows
using embeddinggemma:latest via the Python ollama SDK.

Usage:
    python scripts/patch-cluster-embeddings.py
    python scripts/patch-cluster-embeddings.py --all   # re-embed every row
"""
import sys
import json
import psycopg2
import ollama

OLLAMA_HOST = "http://localhost:11434"
EMBED_MODEL = "embeddinggemma:latest"
PG_DSN      = "postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db"
PATCH_ALL   = "--all" in sys.argv

client = ollama.Client(host=OLLAMA_HOST)

def embed_text(text: str) -> list[float] | None:
    try:
        resp = client.embed(model=EMBED_MODEL, input=text)
        vec = resp.embeddings[0] if resp.embeddings else None
        if vec and len(vec) == 768:
            return vec
        if vec:
            print(f"  bad dim({len(vec)}) → SKIP")
    except Exception as e:
        print(f"  embed error: {e} → SKIP")
    return None

def main():
    conn = psycopg2.connect(PG_DSN)
    conn.autocommit = False
    cur = conn.cursor()

    where = "" if PATCH_ALL else "WHERE summary_embedding IS NULL"
    cur.execute(f"SELECT id, gpu_cluster, summary FROM cluster_summaries {where} ORDER BY gpu_cluster")
    rows = cur.fetchall()

    print(f"Patching {len(rows)} cluster summary embedding(s) (model={EMBED_MODEL})...")
    if not rows:
        print("Nothing to patch.")
        cur.close(); conn.close()
        return

    ok = fail = 0
    for (row_id, cluster, summary) in rows:
        print(f"  Cluster {cluster}: ", end="", flush=True)
        vec = embed_text(summary)
        if vec is None:
            print("SKIP")
            fail += 1
            continue
        cur.execute(
            "UPDATE cluster_summaries SET summary_embedding = %s::vector, updated_at = now() WHERE id = %s",
            (json.dumps(vec), row_id)
        )
        conn.commit()
        print(f"OK (dim={len(vec)})")
        ok += 1

    cur.close()
    conn.close()
    print(f"\nDone: {ok} patched, {fail} failed.")
    if fail:
        sys.exit(1)

if __name__ == "__main__":
    main()
