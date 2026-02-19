# Multi-threaded embedding worker (NATS subscriber placeholder)
import asyncio
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import redis
# import nats
from .gemma_api import get_gemma_embedding
from .gpu_metrics import tensor_core_dot, cosine_similarity_gpu

REDIS = redis.Redis(host='localhost', port=6379, db=0)

async def embedding_worker():
    # nc = await nats.connect("nats://localhost:4222")
    async def handle_doc(msg):
        doc_id = msg.data.decode()
        embedding = get_gemma_embedding(doc_id)
        REDIS.set(doc_id, embedding.tobytes())
        # GPU accelerated clustering / similarity
        # tensor_core_dot / cosine_similarity_gpu
    # await nc.subscribe("documents", cb=handle_doc)
    await asyncio.Event().wait()

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=8) as executor:
        loop.run_until_complete(embedding_worker())
