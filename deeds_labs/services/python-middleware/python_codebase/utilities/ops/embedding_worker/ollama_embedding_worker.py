#!/usr/bin/env python3
"""
ops/embedding_worker/ollama_embedding_worker.py

Minimal Ollama embedding worker:
- listens to RabbitMQ queue 'documents.uploaded'
- calls Ollama embed endpoint for gemma3
- stores embedding bytes to Redis (or Postgres/Qdrant; TODO)
- publishes 'documents.embedded' event

Requires: requests, pika, redis (optional), psycopg2 (optional)
"""
import os
import json
import time
import requests
import pika

RABBIT_URL = os.environ.get('RABBIT_URL', 'amqp://guest:guest@localhost:5672/')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379/0')

EMBED_MODEL = os.environ.get('EMBED_MODEL', 'gemma3')

def get_embedding(text: str):
    # Ollama embed API: POST /embed/{model}
    url = f"{OLLAMA_URL}/embed/{EMBED_MODEL}"
    resp = requests.post(url, json={"text": text}, timeout=30)
    resp.raise_for_status()
    return resp.json().get('embedding')


def main():
    params = pika.URLParameters(RABBIT_URL)
    conn = pika.BlockingConnection(params)
    ch = conn.channel()
    ch.queue_declare('documents.uploaded', durable=True)
    ch.exchange_declare('documents', exchange_type='topic', durable=True)

    def callback(ch, method, properties, body):
        try:
            payload = json.loads(body)
            doc_id = payload.get('documentId') or payload.get('id')
            chunks = payload.get('chunks') or []
            embeddings = []
            for chunk in chunks:
                text = chunk.get('text')
                if not text:
                    embeddings.append(None)
                    continue
                emb = get_embedding(text)
                embeddings.append(emb)
            # TODO: persist embeddings to Postgres/pgvector or Qdrant here
            # For quick prototyping we publish the embeddings (careful with size!)
            out = {'type': 'documents.embedded', 'documentId': doc_id, 'embeddings': embeddings}
            ch.basic_publish(exchange='documents', routing_key='embedded', body=json.dumps(out), properties=pika.BasicProperties(delivery_mode=2))
            ch.basic_ack(delivery_tag=method.delivery_tag)
            print(f'Processed document {doc_id}, embeddings {len(embeddings)}')
        except Exception as e:
            print('Embedding worker failed', e)
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except Exception:
                pass

    ch.basic_qos(prefetch_count=1)
    ch.basic_consume(queue='documents.uploaded', on_message_callback=callback)
    print('Ollama embedding worker started, waiting for messages...')
    try:
        ch.start_consuming()
    except KeyboardInterrupt:
        ch.stop_consuming()
    conn.close()

if __name__ == '__main__':
    main()
