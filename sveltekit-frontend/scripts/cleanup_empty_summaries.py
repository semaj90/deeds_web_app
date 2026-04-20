import psycopg2
conn = psycopg2.connect('postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db')
conn.autocommit = True
cur = conn.cursor()
cur.execute("DELETE FROM cluster_summaries WHERE summary = '' OR summary IS NULL")
print(f'Deleted {cur.rowcount} empty-summary rows')
cur.execute('SELECT COUNT(*), COUNT(summary_embedding) FROM cluster_summaries')
total, with_emb = cur.fetchone()
print(f'Remaining: {total} rows, {with_emb} with embeddings')
cur.close(); conn.close()
