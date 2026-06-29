#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Offline Gemma4 Summary Worker

Generates summaries for unsummarized packets using llama-server Gemma4.
Bounded concurrency (1-6 parallel requests) to avoid VRAM exhaustion.
Resumable checkpointing after each packet.
BitFrost seed cache aware (skips already-seeded packets if --skip-seed set).

Usage:
    python offline_summary_worker.py \
        --input .tmp/summary-backlog-packets.ndjson \
        --output .tmp/gemma4-summary-packets.ndjson \
        --endpoint http://127.0.0.1:8090/v1/completions \
        --concurrency 5 \
        --max-tokens 128 \
        --skip-seed

Session 96 Enhancements:
  - ULID/UUIDv7 pass_run_id for time-ordered batch tracking
  - BitFrost seed cache deduplication
  - Confidence scores (0.95 for real, 0.3 for seed)
"""

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

import aiohttp
import orjson
from tqdm.asyncio import tqdm

try:
    from ulid import ULID
except ImportError:
    ULID = None


class OfflineSummaryWorker:
    def __init__(
        self,
        endpoint: str,
        concurrency: int = 2,
        max_tokens: int = 128,
        temperature: float = 0.3,
        timeout: int = 90,
        skip_seed: bool = False,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_password: Optional[str] = None,
    ):
        # Validate concurrency (1-6 safe for RTX 3060 Ti 8GB with q8_0/q8_0 KV cache)
        if concurrency < 1 or concurrency > 6:
            raise ValueError(f"Concurrency must be 1-6, got {concurrency}")

        self.endpoint = endpoint
        self.concurrency = concurrency
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.timeout = timeout
        self.skip_seed = skip_seed
        self.semaphore = asyncio.Semaphore(concurrency)
        self.session: Optional[aiohttp.ClientSession] = None

        # Generate pass_run_id (ULID if available, else UUID)
        self.pass_run_id = str(ULID()) if ULID else str(uuid4())
        self.created_at = datetime.utcnow().isoformat() + "Z"

        # Redis client for seed cache checking
        self.redis = None
        self.redis_host = redis_host
        self.redis_port = redis_port
        self.redis_password = redis_password
        self.seed_cache_hits = 0
        self.seed_cache_misses = 0

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()

        # Optional: connect to Redis for seed cache checking
        if self.skip_seed:
            try:
                import redis.asyncio as aioredis
                self.redis = await aioredis.from_url(
                    f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}",
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_keepalive=True
                )
            except Exception as e:
                print(f"  [Warning] Redis connection failed: {e}. Skipping seed cache check.")
                self.redis = None

        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self.session:
            await self.session.close()
        if self.redis:
            await self.redis.close()

    async def check_seed_cache(self, packet_key: str) -> Optional[dict]:
        """Check BitFrost seed cache for existing summary."""
        if not self.redis:
            return None

        try:
            # Check seed cache (marked with _seed suffix, low confidence)
            cache_key = f"bifrost:summary:{packet_key}:_seed"
            cached = await self.redis.get(cache_key)
            if cached:
                self.seed_cache_hits += 1
                return json.loads(cached)
        except Exception:
            pass

        self.seed_cache_misses += 1
        return None

    async def summarize_packet(self, packet: dict) -> dict:
        """Summarize a single packet via llama-server."""
        packet_key = packet.get("packet_key", "unknown")
        source_ref = packet.get("source_ref", "")
        feature_id = packet.get("feature_id", "")
        feature_label = packet.get("feature_label", "")
        keywords = packet.get("keywords", [])

        # Check seed cache first (DRY optimization)
        if self.skip_seed:
            seed = await self.check_seed_cache(packet_key)
            if seed:
                return {
                    "packet_key": packet_key,
                    "source_ref": source_ref,
                    "feature_id": feature_id,
                    "summary": seed.get("content", ""),
                    "tags": seed.get("tags", []),
                    "status": "seed_cache_hit",
                    "confidence": 0.3,
                    "pass_run_id": self.pass_run_id,
                    "provenance": {
                        "source": "bitfrost_seed_cache",
                        "is_seed": True,
                        "confidence": 0.3,
                    },
                }

        # Build prompt
        keywords_str = ", ".join(keywords[:5]) if keywords else "(no keywords)"
        prompt = f"""Summarize this code feature in 1-2 sentences:

Feature: {feature_label}
Source: {source_ref}
Keywords: {keywords_str}

Summary:"""

        async with self.semaphore:
            try:
                payload = {
                    "model": "gemma4-legal-iq4xs-direct.gguf",
                    "prompt": prompt,
                    "max_tokens": self.max_tokens,
                    "temperature": self.temperature,
                    "stream": False,
                }

                async with self.session.post(
                    self.endpoint,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.timeout),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        summary_text = data.get("choices", [{}])[0].get("text", "").strip()

                        return {
                            "packet_key": packet_key,
                            "source_ref": source_ref,
                            "feature_id": feature_id,
                            "summary": summary_text,
                            "tags": keywords[:5],
                            "status": "success",
                            "confidence": 0.95,
                            "pass_run_id": self.pass_run_id,
                            "model": "gemma4-legal-iq4xs-direct.gguf",
                            "temperature": self.temperature,
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                            "provenance": {
                                "source": "gemma4-llama-server",
                                "endpoint": self.endpoint,
                                "temperature": self.temperature,
                                "max_tokens": self.max_tokens,
                                "deterministic": False,
                            },
                        }
                    else:
                        text = await resp.text()
                        return {
                            "packet_key": packet_key,
                            "source_ref": source_ref,
                            "summary": f"[HTTP {resp.status}: {text[:100]}]",
                            "status": "error_http",
                        }

            except asyncio.TimeoutError:
                return {
                    "packet_key": packet_key,
                    "source_ref": source_ref,
                    "summary": "[Timeout after 60s]",
                    "status": "error_timeout",
                }
            except Exception as e:
                return {
                    "packet_key": packet_key,
                    "source_ref": source_ref,
                    "summary": f"[Error: {str(e)[:100]}]",
                    "status": "error_exception",
                }

    async def process_backlog(
        self, input_path: Path, output_path: Path, limit: Optional[int] = None
    ) -> dict:
        """Process NDJSON backlog of unsummarized packets."""
        # Load input packets
        packets = []
        with open(input_path, "r") as f:
            for line in f:
                if line.strip():
                    try:
                        packets.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass

        if limit:
            packets = packets[:limit]

        print(f"Processing {len(packets)} packets...")

        # Check for existing output checkpoint
        output_path.parent.mkdir(parents=True, exist_ok=True)
        existing_keys = set()
        if output_path.exists():
            with open(output_path, "r") as f:
                for line in f:
                    if line.strip():
                        try:
                            obj = json.loads(line)
                            existing_keys.add(obj.get("packet_key"))
                        except:
                            pass
            print(f"  Resuming from checkpoint ({len(existing_keys)} already done)")

        # Filter to new packets
        new_packets = [p for p in packets if p.get("packet_key") not in existing_keys]

        if not new_packets:
            print("All packets already processed.")
            return {
                "total_packets": len(packets),
                "processed": 0,
                "success": len(existing_keys),
                "skipped": len(packets) - len(new_packets),
            }

        # Process new packets with progress bar
        results = []
        with open(output_path, "a") as f:
            tasks = [self.summarize_packet(p) for p in new_packets]
            # Process with manual progress tracking
            completed = 0
            for future in asyncio.as_completed(tasks):
                try:
                    result = await future
                    results.append(result)
                    # Checkpoint each result
                    f.write(orjson.dumps(result).decode() + "\n")
                    f.flush()
                    completed += 1
                    pct = (100 * completed) // len(new_packets)
                    print(f"  [{pct}%] {completed}/{len(new_packets)} {result.get('packet_key', 'unknown')}")
                except Exception as e:
                    print(f"  Error: {e}")

        # Count results
        success_count = sum(1 for r in results if r.get("status") == "success")
        error_count = len(results) - success_count

        return {
            "total_packets": len(packets),
            "processed": len(new_packets),
            "success": success_count + len(existing_keys),
            "error": error_count,
            "skipped": len(packets) - len(new_packets),
        }


async def main():
    parser = argparse.ArgumentParser(description="Offline Gemma4 summary worker")
    parser.add_argument("--input", required=True, help="Input NDJSON backlog path")
    parser.add_argument("--output", required=True, help="Output NDJSON summaries path")
    parser.add_argument(
        "--endpoint",
        default="http://127.0.0.1:8090/v1/completions",
        help="llama-server endpoint",
    )
    parser.add_argument("--concurrency", type=int, default=5, help="Parallel requests (1-6, default 5)")
    parser.add_argument("--max-tokens", type=int, default=128, help="Max tokens per summary (default 128)")
    parser.add_argument("--temperature", type=float, default=0.3, help="Temperature (default 0.3)")
    parser.add_argument("--timeout", type=int, default=120, help="Request timeout (seconds, default 120 for Gemma4)")
    parser.add_argument("--skip-seed", action="store_true", help="Skip already-seeded packets via BitFrost (requires Redis)")
    parser.add_argument("--redis-host", default="localhost", help="Redis host (default localhost)")
    parser.add_argument("--redis-port", type=int, default=6379, help="Redis port (default 6379)")
    parser.add_argument("--redis-password", help="Redis password (from env or arg)")

    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    print(f"\n[Offline Gemma4 Summary Worker]")
    print(f"{'=' * 50}")
    print(f"  Input:       {input_path}")
    print(f"  Output:      {output_path}")
    print(f"  Endpoint:    {args.endpoint}")
    print(f"  Concurrency: {args.concurrency}")
    print(f"  Max tokens:  {args.max_tokens}")

    redis_password = args.redis_password or sys.argv[0].__hash__()  # Fallback to env
    try:
        import os
        redis_password = os.environ.get("REDIS_PASSWORD", args.redis_password)
    except:
        pass

    async with OfflineSummaryWorker(
        endpoint=args.endpoint,
        concurrency=args.concurrency,
        max_tokens=args.max_tokens,
        temperature=args.temperature,
        timeout=args.timeout,
        skip_seed=args.skip_seed,
        redis_host=args.redis_host,
        redis_port=args.redis_port,
        redis_password=redis_password,
    ) as worker:
        stats = await worker.process_backlog(input_path, output_path)

    print(f"\n[Complete]:")
    print(f"  Total packets:  {stats['total_packets']}")
    print(f"  Processed:      {stats['processed']}")
    print(f"  Success:        {stats['success']}")
    print(f"  Errors:         {stats.get('error', 0)}")
    print(f"  Skipped:        {stats['skipped']}")
    if args.skip_seed and worker.redis:
        print(f"\n[BitFrost Seed Cache]:")
        print(f"  Seed hits:      {worker.seed_cache_hits}")
        print(f"  Seed misses:    {worker.seed_cache_misses}")
        total_seed = worker.seed_cache_hits + worker.seed_cache_misses
        if total_seed > 0:
            hit_rate = (100 * worker.seed_cache_hits) // total_seed
            print(f"  Hit rate:       {hit_rate}%")
    if ULID:
        print(f"\n[Session Info]:")
        print(f"  Pass run ID:    {worker.pass_run_id} (ULID)")
        print(f"  Created at:     {worker.created_at}")


if __name__ == "__main__":
    asyncio.run(main())
