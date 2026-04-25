async def ingest_text(doc_id: str, text: str, source: str = "agentic"):
    from python_codebase.model_tools.summarize_and_embed import embed_text
    import psycopg2, os
    conn = psycopg2.connect(os.getenv("PG_URL"))
    cur = conn.cursor()
    emb = await embed_text(text)
    cur.execute("""
        INSERT INTO embeddings (id, source, content, vector)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (id) DO NOTHING;
    """, (doc_id, source, text, emb))
    conn.commit()
    cur.close()
    conn.close()