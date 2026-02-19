#!/usr/bin/env python3
"""
Synthetic analytics/feedback generator for local testing.

Example:
  python native/autoencoder/scripts/replay_analytics.py --events 25 --users 3
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import string
import time
import uuid
from datetime import datetime

from redis.asyncio import Redis


USER_ACTIONS = [
    "search_contract",
    "upload_document",
    "open_case_summary",
    "download_bundle",
    "request_analysis",
    "check_queue",
    "view_dashboard",
]

FEEDBACK_TYPES = ["thumbs_up", "thumbs_down"]


def _random_payload() -> str:
    payload = {
        "section": random.choice(["overview", "evidence", "analysis", "timeline"]),
        "latency_ms": random.randint(120, 2400),
        "confidence": round(random.random(), 3),
    }
    return json.dumps(payload)


def _random_text(words: int = 32) -> str:
    return " ".join(
        "".join(random.choices(string.ascii_lowercase, k=random.randint(3, 8)))
        for _ in range(words)
    )


async def push_event(redis: Redis, stream: str, payload: dict) -> None:
    await redis.xadd(stream, payload)


async def replay(args: argparse.Namespace) -> None:
    redis = Redis.from_url(args.redis_url, decode_responses=True)
    users = [f"user_{i}" for i in range(1, args.users + 1)]

    print(f"[replay] sending {args.events} analytics events for {len(users)} users -> {args.analytics_stream}")
    for idx in range(args.events):
        user = random.choice(users)
        payload = {
            "userId": user,
            "action": random.choice(USER_ACTIONS),
            "payload": _random_payload(),
            "timestamp": datetime.utcnow().isoformat(),
            "sessionId": str(uuid.uuid4()),
        }
        await push_event(redis, args.analytics_stream, payload)

        if args.feedback and random.random() < args.feedback_probability:
            feedback = {
                "userId": user,
                "query": _random_text(24),
                "response": _random_text(40),
                "feedback": random.choice(FEEDBACK_TYPES),
                "reward": round(random.uniform(-1.0, 1.0), 3),
                "timestamp": int(time.time() * 1000),
            }
            await push_event(redis, args.feedback_stream, feedback)

        if args.delay > 0:
            await asyncio.sleep(args.delay)

    await redis.close()
    print("[replay] done.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay synthetic analytics events into Redis streams.")
    parser.add_argument("--redis-url", default="redis://localhost:6379/0")
    parser.add_argument("--analytics-stream", default="user.analytics")
    parser.add_argument("--feedback-stream", default="rl.feedback")
    parser.add_argument("--events", type=int, default=50, help="Number of analytics events to push")
    parser.add_argument("--users", type=int, default=5, help="Distinct user IDs to cycle through")
    parser.add_argument("--delay", type=float, default=0.0, help="Delay between events (seconds)")
    parser.add_argument("--feedback", action="store_true", help="Emit RL feedback entries alongside analytics")
    parser.add_argument("--feedback-probability", type=float, default=0.25, help="Chance of sending feedback per event")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(replay(args))


if __name__ == "__main__":
    main()

