#!/usr/bin/env python3
"""
Periodic adapter ranker. Reads adapter metrics from Redis and Neo4j,
computes a composite score, updates Redis ZSET `adapters:rank`, and
optionally triggers a Triton model plan reload via HTTP (if TRITON_URL is set).

Env vars expected:
- REDIS_URL (optional) e.g. redis://localhost:6379
- NEO4J_URI (optional) e.g. bolt://localhost:7687
- NEO4J_USER, NEO4J_PASS
- TRITON_URL (optional) e.g. http://localhost:8000
- RANK_INTERVAL (seconds, default 60)

This script is safe to run as a cron job or as a background service.
"""
import os
import time
import json
import logging
from typing import Dict, Any

import redis
from neo4j import GraphDatabase
import requests

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASS = os.environ.get("NEO4J_PASS", "password")
TRITON_URL = os.environ.get("TRITON_URL")
RANK_INTERVAL = int(os.environ.get("RANK_INTERVAL", "60"))

r = redis.from_url(REDIS_URL, decode_responses=True)
neo_driver = None
if NEO4J_URI and NEO4J_USER and NEO4J_PASS:
    try:
        neo_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
    except Exception as e:
        logging.warning("Failed to connect to Neo4j: %s", e)
        neo_driver = None


def pull_feedback_from_neo4j() -> Dict[str, float]:
    """Pull average feedback per adapter from Neo4j and return dict adapter->avg_score"""
    out = {}
    if not neo_driver:
        return out
    try:
        with neo_driver.session() as session:
            result = session.run("MATCH (u)-[r:RATED]->(a) RETURN a.id AS aid, avg(r.score) AS avg")
            for row in result:
                aid = row["aid"]
                avg = row["avg"]
                try:
                    out[aid] = float(avg)
                except Exception:
                    out[aid] = 0.0
    except Exception as e:
        logging.warning("Neo4j pull failed: %s", e)
    return out


def compute_score(metrics: Dict[str, str], feedback_avg: float = 0.0) -> float:
    """Compute composite score from Redis-stored metrics and neo4j feedback_avg."""
    try:
        pos = int(metrics.get("feedback_pos", 0))
        neg = int(metrics.get("feedback_neg", 0))
        latency = float(metrics.get("latency", 100.0))
        # basic score: feedback ratio (pos-neg)/(pos+neg+1) weighted, plus inverse latency
        feedback_component = ((pos - neg) / max(1, pos + neg + 1))
        latency_component = (100.0 / (latency + 1.0))
        # combine with neo4j averaged feedback
        score = feedback_component * 0.6 + latency_component * 0.3 + (feedback_avg * 0.1)
        return float(score)
    except Exception:
        return 0.0


def update_ranks_and_maybe_trigger():
    adapters = r.zrange("adapters:rank", 0, -1)
    if not adapters:
        logging.info("No adapters registered in adapters:rank")
        return
    feedback_map = pull_feedback_from_neo4j()
    updates = {}
    for a in adapters:
        metrics = r.hgetall(f"adapter:{a}") or {}
        feedback_avg = feedback_map.get(a, 0.0)
        score = compute_score(metrics, feedback_avg)
        updates[a] = score
        logging.info("[Ranker] %s -> %.4f (metrics=%s, feedback_avg=%.3f)", a, score, json.dumps(metrics), feedback_avg)

    # Apply ZADD in a pipeline
    pipe = r.pipeline()
    for a, s in updates.items():
        pipe.zadd("adapters:rank", {a: s})
    pipe.execute()

    # Optionally trigger Triton model plan reload if TRITON_URL is set
    if TRITON_URL:
        try:
            payload = {"updated": list(updates.keys())}
            resp = requests.post(f"{TRITON_URL.rstrip('/')}/v2/models/reload-adapters", json=payload, timeout=5)
            logging.info("Triton reload response: %s", resp.text)
        except Exception as e:
            logging.warning("Failed to notify Triton: %s", e)


if __name__ == "__main__":
    logging.info("Starting adapter ranker (interval=%ds)", RANK_INTERVAL)
    while True:
        try:
            update_ranks_and_maybe_trigger()
        except Exception as e:
            logging.warning("Ranker loop error: %s", e)
        time.sleep(RANK_INTERVAL)
