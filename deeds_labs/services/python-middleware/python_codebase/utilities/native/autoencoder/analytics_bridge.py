"""
Analytics Bridge (Phase H)

Small FastAPI bridge that ingests user analytics events and returns predicted
intent metadata. Events are written to a Redis stream for background consumers
such as the behavior router or trainer processes.
"""
import os
import json
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from redis import Redis


REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
USER_ANALYTICS_STREAM = os.environ.get("USER_ANALYTICS_STREAM", "user.analytics")
USER_INTENT_HASH = os.environ.get("USER_INTENT_HASH", "user:intent")

app = FastAPI(title="Analytics Bridge", version="1.0.0")
redis = Redis.from_url(REDIS_URL, decode_responses=True)


class AnalyticsEvent(BaseModel):
    userId: str = Field(..., description="Unique user identifier")
    action: str = Field(..., description="Action name, e.g. search_contract")
    payload: Optional[Dict[str, Any]] = Field(None, description="Any extra metadata")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class IntentResponse(BaseModel):
    userId: str
    clusterId: Optional[str]
    predictedIntent: Optional[str]
    confidence: float = 0.0


def _redis_key(namespace: str, identifier: str) -> str:
    if namespace:
        return f"{namespace}:{identifier}"
    return identifier


@app.post("/analytics", status_code=202)
def ingest_analytics(event: AnalyticsEvent) -> Dict[str, str]:
    payload = event.dict()
    payload["timestamp"] = payload["timestamp"].isoformat()
    # write to a Redis stream for background consumers
    redis.xadd(USER_ANALYTICS_STREAM, payload)

    user_key = _redis_key("user", event.userId)
    redis.hset(user_key, mapping={"last_action": event.action, "last_timestamp": payload["timestamp"]})
    redis.lpush(f"{user_key}:actions", event.action)
    return {"status": "queued"}


@app.get("/intent/{user_id}", response_model=IntentResponse)
def get_intent(user_id: str) -> IntentResponse:
    intent_key = _redis_key(USER_INTENT_HASH, user_id)
    data = redis.hgetall(intent_key)
    if not data:
        raise HTTPException(status_code=404, detail="Intent not available")

    return IntentResponse(
        userId=user_id,
        clusterId=data.get("cluster"),
        predictedIntent=data.get("intent"),
        confidence=float(data.get("confidence", 0.0)),
    )


@app.get("/health")
def health() -> Dict[str, str]:
    try:
        redis.ping()
    except Exception as exc:  # pragma: no cover - connectivity issues
        raise HTTPException(status_code=503, detail=f"Redis unavailable: {exc}") from exc
    return {"status": "ok"}


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8001)))
