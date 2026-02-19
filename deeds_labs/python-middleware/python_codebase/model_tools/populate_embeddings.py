#!/usr/bin/env python3
import requests
import psycopg2
import json

# Database connection
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="legal_ai_db",
    user="legal_admin",
    password="123456"
)
cur = conn.cursor()

# Get messages without embeddings
cur.execute("SELECT id, content FROM messages WHERE embedding IS NULL")
messages = cur.fetchall()

print(f"Found {len(messages)} messages without embeddings")

for msg_id, content in messages:
    print(f"Processing message {msg_id}: {content[:50]}...")

    # Generate embedding using embeddinggemma via Ollama
    response = requests.post("http://localhost:11434/api/embeddings", json={
        "model": "embeddinggemma:latest",
        "prompt": content
    })

    if response.status_code == 200:
        embedding = response.json()["embedding"]

        # Update message with embedding (convert to PostgreSQL vector format)
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"
        cur.execute("UPDATE messages SET embedding = %s::vector WHERE id = %s", (embedding_str, msg_id))

        print(f"[OK] Updated message {msg_id} with {len(embedding)}-dim embedding")
    else:
        print(f"[ERROR] Failed to generate embedding for message {msg_id}: {response.text}")

conn.commit()
cur.close()
conn.close()
print("[OK] All embeddings populated!")