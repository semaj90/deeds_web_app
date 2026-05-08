import psycopg2
conn = psycopg2.connect('postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db')
cur = conn.cursor()
cur.execute('SELECT gpu_cluster, LENGTH(summary), LEFT(summary, 80) FROM cluster_summaries ORDER BY gpu_cluster')
for row in cur.fetchall():
    print(f'cluster {row[0]:>2}: len={row[1]:>4} | {repr(row[2][:60])}')
cur.close(); conn.close()
