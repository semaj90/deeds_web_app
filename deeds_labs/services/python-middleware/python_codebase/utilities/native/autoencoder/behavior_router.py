#!/usr/bin/env python3
"""
Behavior router for the Phase H+ bridge.

Continuously consumes analytics events from Redis, maintains a per-user
Hidden Markov Model, and writes the latest intent + cluster predictions
back to Redis so the SvelteKit orchestrator can pick optimal adapters.

Additional responsibilities:
  * persist transition summaries to PostgreSQL for long-term analytics
  * optionally project cluster→intent edges into Neo4j for graph queries

This module is designed to run as a long-lived worker process:

    python native/autoencoder/behavior_router.py
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np
from hmmlearn.hmm import MultinomialHMM
from redis.asyncio import Redis

try:  # Optional dependencies (loaded when configured)
    import asyncpg  # type: ignore
except Exception:  # pragma: no cover - asyncpg not available
    asyncpg = None  # type: ignore

try:
    from neo4j import AsyncGraphDatabase  # type: ignore
except Exception:  # pragma: no cover - neo4j driver missing
    AsyncGraphDatabase = None  # type: ignore


LOGGER = logging.getLogger("phase_h.behavior_router")
logging.basicConfig(
    level=os.environ.get("BEHAVIOR_ROUTER_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
ANALYTICS_STREAM = os.environ.get("USER_ANALYTICS_STREAM", "user.analytics")
INTENT_HASH_NAMESPACE = os.environ.get("USER_INTENT_HASH_NAMESPACE", "user:intent")
RL_FEEDBACK_STREAM = os.environ.get("RL_FEEDBACK_STREAM", "rl.feedback")

PG_URL = os.environ.get("PG_URL")
PG_INTENT_TABLE = os.environ.get("PG_INTENT_TABLE", "user_intent_transitions")

NEO4J_URI = os.environ.get("NEO4J_URI")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password")

MIN_SEQUENCE_LENGTH = int(os.environ.get("BEHAVIOR_ROUTER_MIN_SEQ", "6"))
SEQUENCE_WINDOW = int(os.environ.get("BEHAVIOR_ROUTER_WINDOW", "64"))
MAX_COMPONENTS = int(os.environ.get("BEHAVIOR_ROUTER_COMPONENTS", "5"))
STREAM_BLOCK_MS = int(os.environ.get("BEHAVIOR_ROUTER_STREAM_BLOCK_MS", "5000"))
RETRAIN_COOLDOWN = float(os.environ.get("BEHAVIOR_ROUTER_RETRAIN_SECONDS", "10.0"))


@dataclass
class AnalyticsEvent:
    """Normalized analytics payload from the Redis stream."""

    event_id: str
    user_id: str
    action: str
    payload: Dict[str, object]
    observed_at: datetime

    @classmethod
    def from_redis(cls, event_id: str, data: Dict[str, str]) -> Optional["AnalyticsEvent"]:
        user_id = data.get("userId") or data.get("user_id")
        action = data.get("action")
        if not user_id or not action:
            return None

        payload_raw = data.get("payload")
        payload: Dict[str, object]
        if payload_raw:
            try:
                payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw  # type: ignore
                if not isinstance(payload, dict):
                    payload = {}
            except Exception:
                payload = {}
        else:
            payload = {}

        timestamp_raw = data.get("timestamp") or data.get("ts")
        try:
            observed_at = datetime.fromisoformat(timestamp_raw) if timestamp_raw else datetime.utcnow()
        except Exception:
            observed_at = datetime.utcnow()

        return cls(
            event_id=event_id,
            user_id=user_id,
            action=action,
            payload=payload,
            observed_at=observed_at,
        )


class BehaviorRouter:
    """Stateful coordinator that maintains per-user HMMs and intent predictions."""

    def __init__(self) -> None:
        self.redis: Redis = Redis.from_url(REDIS_URL, decode_responses=True)
        self.stop_event = asyncio.Event()
        self.last_stream_id = os.environ.get("BEHAVIOR_ROUTER_START", "0-0")

        # per-user rolling history of action ids
        self.sequences: Dict[str, Deque[int]] = defaultdict(lambda: deque(maxlen=SEQUENCE_WINDOW))
        # track last retrain time per user to avoid over-fitting
        self.last_retrain: Dict[str, float] = defaultdict(lambda: 0.0)

        # action indexing shared across users
        self.action_to_idx: Dict[str, int] = {}
        self.idx_to_action: Dict[int, str] = {}

        # cached user-specific models
        self.models: Dict[str, MultinomialHMM] = {}

        # optional resources
        self.pg_pool: Optional["asyncpg.pool.Pool"] = None  # type: ignore[name-defined]
        self.neo4j_driver = None

    async def initialize(self) -> None:
        if PG_URL and asyncpg:
            LOGGER.info("Connecting to PostgreSQL at %s", PG_URL)
            self.pg_pool = await asyncpg.create_pool(PG_URL, min_size=0, max_size=5)  # type: ignore[attr-defined]
        elif PG_URL:
            LOGGER.warning("PG_URL provided but asyncpg is unavailable; skipping Postgres integration")

        if NEO4J_URI and AsyncGraphDatabase:
            LOGGER.info("Connecting to Neo4j at %s", NEO4J_URI)
            self.neo4j_driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))  # type: ignore[attr-defined]
        elif NEO4J_URI:
            LOGGER.warning("NEO4J_URI provided but neo4j driver is unavailable; skipping Neo4j integration")

    async def close(self) -> None:
        await self.redis.close()
        if self.pg_pool:
            await self.pg_pool.close()  # type: ignore[func-returns-value]
        if self.neo4j_driver:
            await self.neo4j_driver.close()  # type: ignore[attr-defined]

    async def run(self) -> None:
        await self.initialize()
        LOGGER.info("Behavior router starting (stream=%s, namespace=%s)", ANALYTICS_STREAM, INTENT_HASH_NAMESPACE)
        try:
            while not self.stop_event.is_set():
                entries = await self.redis.xread(
                    streams={ANALYTICS_STREAM: self.last_stream_id},
                    count=128,
                    block=STREAM_BLOCK_MS,
                )
                if not entries:
                    continue

                for stream_name, events in entries:
                    if stream_name != ANALYTICS_STREAM:
                        continue
                    for event_id, payload in events:
                        evt = AnalyticsEvent.from_redis(event_id, payload)
                        if not evt:
                            LOGGER.debug("Skipping malformed analytics payload: %s", payload)
                            self.last_stream_id = event_id
                            continue
                        await self.handle_event(evt)
                        self.last_stream_id = event_id
        finally:
            await self.close()
            LOGGER.info("Behavior router stopped")

    def request_stop(self) -> None:
        self.stop_event.set()

    async def handle_event(self, event: AnalyticsEvent) -> None:
        encoded_action = self._encode_action(event.action)
        sequence = self.sequences[event.user_id]
        sequence.append(encoded_action)

        # persist raw analytics context for upcoming RL steps
        await self._record_latest_action(event)

        if len(sequence) < MIN_SEQUENCE_LENGTH:
            return

        now = asyncio.get_running_loop().time()
        if now - self.last_retrain[event.user_id] < RETRAIN_COOLDOWN:
            return

        self.last_retrain[event.user_id] = now

        model = await self._train_model(event.user_id, list(sequence))
        if not model:
            return

        prediction, confidence = self._predict_next_intent(model, list(sequence))
        if not prediction:
            return

        cluster_id = self._extract_cluster(event)
        await self._store_intent(event.user_id, prediction, confidence, cluster_id)
        await self._persist_transition(event, prediction, confidence, cluster_id)
        await self._project_to_neo4j(event.user_id, cluster_id, prediction, confidence)

    async def _train_model(self, user_id: str, sequence: List[int]) -> Optional[MultinomialHMM]:
        if len(set(sequence)) == 1:
            # degenerate sequence - cannot train a proper model
            return None

        n_symbols = len(self.action_to_idx)
        if n_symbols <= 1:
            return None

        components = min(MAX_COMPONENTS, max(2, len(set(sequence))))

        data = np.array(sequence, dtype=np.int32).reshape(-1, 1)
        lengths = [len(sequence)]

        model = self.models.get(user_id)
        if model is None or model.n_components != components:
            model = MultinomialHMM(
                n_components=components,
                n_iter=50,
                tol=1e-3,
                random_state=42,
                verbose=False,
            )
            self.models[user_id] = model

        # ensure the model knows about the full symbol space
        model.n_features = n_symbols

        try:
            model.fit(data, lengths)
        except ValueError as exc:
            LOGGER.debug("HMM fit failed for user %s: %s", user_id, exc)
            return None

        return model

    def _predict_next_intent(self, model: MultinomialHMM, sequence: List[int]) -> Tuple[Optional[str], float]:
        if not sequence:
            return None, 0.0

        data = np.array(sequence, dtype=np.int32).reshape(-1, 1)
        try:
            _, hidden_states = model.decode(data, algorithm="viterbi")
        except ValueError as exc:
            LOGGER.debug("HMM decode failed: %s", exc)
            return None, 0.0

        current_state = int(hidden_states[-1])
        transition_row = model.transmat_[current_state]
        next_state = int(np.argmax(transition_row))
        transition_confidence = float(transition_row[next_state])

        emission_row = model.emissionprob_[next_state]
        next_symbol = int(np.argmax(emission_row))
        predicted_action = self.idx_to_action.get(next_symbol)
        if not predicted_action:
            return None, 0.0

        confidence = float(min(1.0, transition_confidence * emission_row[next_symbol]))
        return predicted_action, confidence

    async def _store_intent(self, user_id: str, intent: str, confidence: float, cluster_id: Optional[str]) -> None:
        key = f"{INTENT_HASH_NAMESPACE}:{user_id}"
        payload = {
            "user_id": user_id,
            "intent": intent,
            "confidence": f"{confidence:.4f}",
            "cluster": cluster_id or "",
            "updated_at": datetime.utcnow().isoformat(),
        }
        try:
            await self.redis.hset(key, mapping=payload)
        except Exception as exc:  # pragma: no cover - redis hiccups
            LOGGER.warning("Failed to write intent for %s: %s", user_id, exc)

    async def _record_latest_action(self, event: AnalyticsEvent) -> None:
        key = f"user:{event.user_id}"
        try:
            await self.redis.hset(
                key,
                mapping={
                    "last_action": event.action,
                    "last_payload": json.dumps(event.payload),
                    "last_seen": event.observed_at.isoformat(),
                },
            )
        except Exception:  # pragma: no cover
            LOGGER.debug("Could not persist latest action snapshot for %s", event.user_id)

    async def _persist_transition(
        self,
        event: AnalyticsEvent,
        predicted_intent: str,
        confidence: float,
        cluster_id: Optional[str],
    ) -> None:
        if not self.pg_pool:
            return

        query = (
            f"insert into {PG_INTENT_TABLE} "
            "(user_id, action, predicted_intent, confidence, cluster_id, observed_at, payload) "
            "values ($1, $2, $3, $4, $5, $6, $7)"
        )
        try:
            async with self.pg_pool.acquire() as conn:  # type: ignore[attr-defined]
                await conn.execute(
                    query,
                    event.user_id,
                    event.action,
                    predicted_intent,
                    float(confidence),
                    cluster_id,
                    event.observed_at,
                    json.dumps(event.payload),
                )
        except Exception as exc:  # pragma: no cover - database transient errors
            LOGGER.warning("Failed to persist transition for %s: %s", event.user_id, exc)

    async def _project_to_neo4j(
        self,
        user_id: str,
        cluster_id: Optional[str],
        predicted_intent: str,
        confidence: float,
    ) -> None:
        if not self.neo4j_driver or not cluster_id:
            return

        try:
            async with self.neo4j_driver.session() as session:  # type: ignore[attr-defined]
                await session.execute_write(
                    self._neo4j_write_intent,
                    user_id=user_id,
                    cluster_id=cluster_id,
                    intent=predicted_intent,
                    confidence=confidence,
                )
        except Exception as exc:  # pragma: no cover - graph issues
            LOGGER.warning("Failed to project to Neo4j for %s: %s", user_id, exc)

    @staticmethod
    async def _neo4j_write_intent(tx, user_id: str, cluster_id: str, intent: str, confidence: float) -> None:
        await tx.run(
            (
                "MERGE (u:User {id: $user_id}) "
                "MERGE (c:Cluster {id: $cluster_id}) "
                "MERGE (i:Intent {name: $intent}) "
                "MERGE (u)-[r:PREDICTED]->(i) "
                "MERGE (u)-[:MEMBER_OF]->(c) "
                "SET r.confidence = $confidence, r.updated_at = timestamp() "
                "SET c.last_intent = $intent"
            ),
            user_id=user_id,
            cluster_id=cluster_id,
            intent=intent,
            confidence=float(confidence),
        )

    def _encode_action(self, action: str) -> int:
        if action not in self.action_to_idx:
            idx = len(self.action_to_idx)
            self.action_to_idx[action] = idx
            self.idx_to_action[idx] = action
        return self.action_to_idx[action]

    def _extract_cluster(self, event: AnalyticsEvent) -> Optional[str]:
        if "clusterId" in event.payload:
            value = event.payload["clusterId"]
            if isinstance(value, str):
                return value
        if "cluster" in event.payload:
            value = event.payload["cluster"]
            if isinstance(value, str):
                return value
        return None


async def _run_router() -> None:
    router = BehaviorRouter()

    loop = asyncio.get_running_loop()

    def _handle_signal(*_: object) -> None:
        LOGGER.info("Received shutdown signal")
        router.request_stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:  # pragma: no cover - Windows fallback
            signal.signal(sig, lambda *_: router.request_stop())

    await router.run()


if __name__ == "__main__":
    asyncio.run(_run_router())

