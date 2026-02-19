"""
GPU-accelerated summarization + embedding worker backed by TensorRT-LLM and Triton.

This worker pulls jobs from Redis, generates a summary with a CUDA-resident
Seq2Seq model, produces embeddings via Triton (TensorRT engine), and syncs
results to Qdrant and Neo4j. Results are published back to Redis so the
SvelteKit app can hydrate the UI.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import redis
import torch
from neo4j import GraphDatabase, Session
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct
from redis.client import Redis as SyncRedis
from redis.exceptions import RedisError
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from tokenizers import Tokenizer
from torch import Tensor
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from tritonclient.http import InferenceServerClient, InferInput, InferRequestedOutput

LOGGER = logging.getLogger("kgcl.gpu.worker")
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="[%(asctime)s] [%(levelname)s] %(name)s :: %(message)s",
)


# Redis keys (compatible with the SvelteKit service helpers)
DEFAULT_QUEUE = os.environ.get("KGCL_JOB_QUEUE", "kgcl:jobs")
DEFAULT_RESULT_PREFIX = os.environ.get("KGCL_RESULT_PREFIX", "kgcl:result")
DEFAULT_EVENT_STREAM = os.environ.get("KGCL_EVENT_STREAM", "kgcl:stream")


@dataclass
class PipelineTask:
    job_id: str
    doc_id: str
    text: str
    user_id: Optional[str] = None
    source: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_raw(cls, payload: Dict[str, Any]) -> "PipelineTask":
        try:
            return cls(
                job_id=payload["jobId"],
                doc_id=payload["docId"],
                text=payload["text"],
                user_id=payload.get("userId"),
                source=payload.get("source"),
                metadata=payload.get("metadata", {}),
            )
        except KeyError as exc:
            raise ValueError(f"missing required field on task: {exc}") from exc


class SummarizeAndEmbedWorker:
    """
    Core worker handling summarization + embedding.
    - Summarization runs on GPU via HuggingFace transformers.
    - Embedding runs through TensorRT engine served by Triton.
    - Results are persisted to Qdrant and optionally mirrored to Neo4j.
    """

    def __init__(
        self,
        queue: str = DEFAULT_QUEUE,
        redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379"),
        result_prefix: str = DEFAULT_RESULT_PREFIX,
        event_stream: str = DEFAULT_EVENT_STREAM,
        qdrant_url: str = os.environ.get("QDRANT_URL", "http://localhost:6333"),
        qdrant_collection: str = os.environ.get("QDRANT_COLLECTION", "legal_documents"),
        triton_url: str = os.environ.get("TRITON_HTTP_URL", "http://localhost:8000"),
        triton_model: str = os.environ.get("TRITON_MODEL_NAME", "embeddinggemma"),
        hf_model: str = os.environ.get("SUMMARY_MODEL_NAME", "google/embeddinggemma"),
        neo4j_url: Optional[str] = os.environ.get("NEO4J_URI"),
        neo4j_user: Optional[str] = os.environ.get("NEO4J_USERNAME"),
        neo4j_password: Optional[str] = os.environ.get("NEO4J_PASSWORD"),
    ) -> None:
        self.queue = queue
        self.result_prefix = result_prefix
        self.event_stream = event_stream
        self.triton_model = triton_model
        self.qdrant_collection = qdrant_collection

        self.redis: SyncRedis = redis.Redis.from_url(redis_url, decode_responses=False)
        self.triton = InferenceServerClient(triton_url)
        self.qdrant = QdrantClient(url=qdrant_url)

        LOGGER.info("loading summarization model %s onto CUDA", hf_model)
        self.tokenizer: Tokenizer = AutoTokenizer.from_pretrained(hf_model)
        self.model: AutoModelForSeq2SeqLM = AutoModelForSeq2SeqLM.from_pretrained(
            hf_model
        )
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA device is required for summarization worker")
        self.device = torch.device("cuda")
        self.model.to(self.device)
        self.model.eval()

        self.neo4j_driver = (
            GraphDatabase.driver(neo4j_url, auth=(neo4j_user, neo4j_password))
            if neo4j_url and neo4j_user and neo4j_password
            else None
        )
        if self.neo4j_driver:
            LOGGER.info("neo4j integration enabled for %s", neo4j_url)

        self._stopped = False

    # --- public API -----------------------------------------------------------------
    def run(self) -> None:
        LOGGER.info(
            "tensorRT worker started (queue=%s, collection=%s)",
            self.queue,
            self.qdrant_collection,
        )
        while not self._stopped:
            try:
                entry = self.redis.blpop(self.queue, timeout=3)
            except RedisError as exc:
                LOGGER.error("redis BLPOP failed: %s", exc)
                time.sleep(1.0)
                continue

            if entry is None:
                continue

            _, raw_payload = entry
            try:
                payload = json.loads(raw_payload.decode("utf-8"))
                task = PipelineTask.from_raw(payload)
            except Exception as exc:  # broad to capture JSON + validation
                LOGGER.exception("invalid payload on queue: %s", exc)
                continue

            start = time.time()
            try:
                result = self.process_task(task)
                duration = time.time() - start
                LOGGER.info(
                    "processed job=%s doc=%s in %.2fs", task.job_id, task.doc_id, duration
                )
                self.persist_result(task, result)
            except Exception:
                LOGGER.exception("failed processing job %s", task.job_id)
                self.persist_result(
                    task,
                    {
                        "status": "error",
                        "error": "processing_failure",
                    },
                )

    def stop(self) -> None:
        self._stopped = True

    # --- processing -----------------------------------------------------------------
    def process_task(self, task: PipelineTask) -> Dict[str, Any]:
        summary = self.summarize(task.text)
        tags = self.auto_tags(summary or task.text)
        vector = self.embed(summary or task.text)
        self.sync_qdrant(task, vector, summary, tags)
        if self.neo4j_driver:
            self.sync_neo4j(task, summary, tags)

        return {
            "status": "ok",
            "summary": summary,
            "tags": tags,
            "vector": vector,
        }

    def summarize(self, text: str, max_new_tokens: int = 256) -> str:
        encoded = self.tokenizer(
            text,
            truncation=True,
            max_length=1024,
            return_tensors="pt",
        ).to(self.device)
        with torch.inference_mode():
            summary_ids: Tensor = self.model.generate(
                **encoded,
                max_new_tokens=max_new_tokens,
                num_beams=4,
                length_penalty=1.0,
                early_stopping=True,
            )
        return self.tokenizer.decode(summary_ids[0], skip_special_tokens=True).strip()

    def auto_tags(self, text: str, top_k: int = 5) -> List[str]:
        tokens = [
            token
            for token in text.lower().split()
            if token not in ENGLISH_STOP_WORDS and len(token) > 4
        ]
        counter = Counter(tokens)
        return [word for word, _ in counter.most_common(top_k)]

    def embed(self, text: str) -> List[float]:
        payload = np.array([text.encode("utf-8")], dtype=object)
        infer_input = InferInput("TEXT_INPUT", [payload.shape[0]], "BYTES")
        infer_input.set_data_from_numpy(payload)
        output = InferRequestedOutput("VECTOR")
        result = self.triton.infer(
            model_name=self.triton_model,
            inputs=[infer_input],
            outputs=[output],
        )
        vector = result.as_numpy("VECTOR")
        return vector[0].astype(float).tolist()

    def sync_qdrant(
        self, task: PipelineTask, vector: List[float], summary: str, tags: List[str]
    ) -> None:
        point = PointStruct(
            id=task.doc_id,
            vector=vector,
            payload={
                "summary": summary,
                "tags": tags,
                "userId": task.user_id,
                "source": task.source,
                "metadata": task.metadata,
            },
        )
        self.qdrant.upsert(
            collection_name=self.qdrant_collection,
            wait=True,
            points=[point],
        )

    def sync_neo4j(
        self, task: PipelineTask, summary: str, tags: Iterable[str], rank: int = 1
    ) -> None:
        assert self.neo4j_driver is not None
        with self.neo4j_driver.session() as session:  # type: Session
            session.execute_write(
                self._neo4j_write,
                user_id=task.user_id,
                doc_id=task.doc_id,
                summary=summary,
                tags=list(tags),
                rank=rank,
            )

    @staticmethod
    def _neo4j_write(
        tx: Session,
        *,
        user_id: Optional[str],
        doc_id: str,
        summary: str,
        tags: List[str],
        rank: int,
    ) -> None:
        tx.run(
            """
            MERGE (e:Evidence {id: $docId})
            SET e.summary = $summary,
                e.rank = $rank,
                e.updatedAt = datetime()
            WITH e
            UNWIND $tags AS tagName
              MERGE (t:Tag {name: tagName})
              MERGE (e)-[:TAGGED_WITH]->(t)
            WITH e
            CALL apoc.do.when(
              $userId IS NOT NULL,
              'MERGE (u:User {id: $userId}) MERGE (u)-[:VIEWED]->(e)',
              '',
              {userId: $userId, e: e}
            ) YIELD value
            RETURN e
            """,
            docId=doc_id,
            summary=summary,
            rank=rank,
            tags=tags,
            userId=user_id,
        )

    # --- persistence ----------------------------------------------------------------
    def persist_result(self, task: PipelineTask, payload: Dict[str, Any]) -> None:
        record = {
            "jobId": task.job_id,
            "docId": task.doc_id,
            "userId": task.user_id,
            "source": task.source,
            "metadata": task.metadata,
            "result": payload,
            "timestamp": time.time(),
        }
        key = f"{self.result_prefix}:{task.job_id}"
        try:
            self.redis.set(key, json.dumps(record), ex=3600)
            self.redis.xadd(
                self.event_stream,
                {
                    "jobId": task.job_id,
                    "docId": task.doc_id,
                    "status": payload.get("status", "unknown"),
                },
            )
        except RedisError as exc:
            LOGGER.error("redis write failed for job %s: %s", task.job_id, exc)


# --------------------------------------------------------------------------------------
# CLI entry-points


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="GPU summarization worker")
    parser.add_argument(
        "--single",
        action="store_true",
        help="Process a single document provided via --doc-id/--text and exit",
    )
    parser.add_argument("--doc-id", type=str, help="Document identifier for single run")
    parser.add_argument("--text", type=str, help="Raw text content for single run")
    return parser.parse_args(argv)


def run_single(worker: SummarizeAndEmbedWorker, doc_id: str, text: str) -> None:
    task = PipelineTask(job_id=f"single-{int(time.time())}", doc_id=doc_id, text=text)
    result = worker.process_task(task)
    print(json.dumps(result, indent=2))


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    worker = SummarizeAndEmbedWorker()

    def handle_signal(signum: int, _frame: Any) -> None:
        LOGGER.info("received signal %s, shutting down", signum)
        worker.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, handle_signal)

    if args.single:
        if not args.doc_id or not args.text:
            print("--single mode requires --doc-id and --text", file=sys.stderr)
            return 2
        run_single(worker, args.doc_id, args.text)
        return 0

    worker.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

