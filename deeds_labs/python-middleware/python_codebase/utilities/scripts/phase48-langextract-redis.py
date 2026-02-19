#!/usr/bin/env python3
"""
Phase 48 - LangExtract + Redis I/O Pair Builder

Scans Redis diagnostic keys (default: ai:embedding:*) and emits compact
{input, output, tokens} hashes for later LLM fine-tuning or RAG analysis.
"""

from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path

import redis
from langchain.text_splitter import RecursiveCharacterTextSplitter
from transformers import AutoTokenizer


def derive_pairs(text: str, splitter, tokenizer, max_pairs: int | None = None):
    documents = splitter.split_text(text)
    pairs = []
    for chunk in documents:
        midpoint = max(1, len(chunk) // 2)
        inp = chunk[:midpoint]
        out = chunk[midpoint:]
        pair = {
            "id": str(uuid.uuid4()),
            "input": inp,
            "output": out,
            "tokens": len(tokenizer.encode(chunk, add_special_tokens=False)),
        }
        pairs.append(pair)
        if max_pairs and len(pairs) >= max_pairs:
            break
    return pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--redis-url", default="redis://:redis@localhost:6379/0")
    parser.add_argument("--pattern", default="ai:embedding:*")
    parser.add_argument("--chunk-size", type=int, default=512)
    parser.add_argument("--chunk-overlap", type=int, default=64)
    parser.add_argument("--max-pairs", type=int, default=0)
    parser.add_argument("--tokenizer", default="google/gemma-2b")
    parser.add_argument(
        "--report-path",
        default=".cache/langextract-pairs.json",
        help="Optional debug export of generated pairs.",
    )
    args = parser.parse_args()

    limit_pairs = args.max_pairs if args.max_pairs > 0 else None
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=args.chunk_size, chunk_overlap=args.chunk_overlap
    )
    tokenizer = AutoTokenizer.from_pretrained(args.tokenizer)
    client = redis.Redis.from_url(args.redis_url, decode_responses=True)

    all_pairs = []
    processed = 0
    for key in client.scan_iter(match=args.pattern):
        raw = client.get(key)
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        text = ""
        if isinstance(payload, dict):
            text = payload.get("message") or payload.get("content") or ""
        elif isinstance(payload, str):
            text = payload
        if not text:
            continue

        pairs = derive_pairs(text, splitter, tokenizer, limit_pairs)
        for pair in pairs:
            redis_key = f"ai:llm:pair:{pair['id']}"
            client.hset(redis_key, mapping=pair)
            all_pairs.append({"key": redis_key, **pair})
        processed += 1

    Path(args.report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report_path).write_text(json.dumps(all_pairs, indent=2), encoding="utf-8")
    print(f"✅ Stored {len(all_pairs)} LLM I/O pairs from {processed} Redis records.")
    print(f"📄 Debug report: {args.report_path}")


if __name__ == "__main__":
    main()
