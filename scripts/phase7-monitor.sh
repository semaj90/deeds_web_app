#!/bin/bash
# Phase 7 queue monitor — alerts when queue drops below refill threshold

REFILL_THRESHOLD=200
CHECK_INTERVAL=30

while true; do
  QUEUE_DEPTH=$(curl -s -u guest:guest http://127.0.0.1:15672/api/queues/phase7.summarization 2>/dev/null | jq '.messages // 0')
  CONSUMERS=$(curl -s -u guest:guest http://127.0.0.1:15672/api/queues/phase7.summarization 2>/dev/null | jq '.consumers // 0')
  DLQ=$(curl -s -u guest:guest http://127.0.0.1:15672/api/queues/phase7.summarization.dlq 2>/dev/null | jq '.messages // 0')
  PG_COUNT=$(docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT COUNT(CASE WHEN summary IS NOT NULL AND LENGTH(summary) > 0 THEN 1 END) FROM codebase_chunk_index;" 2>/dev/null | tr -d ' ')

  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

  echo "[$TIMESTAMP] Queue: $QUEUE_DEPTH msgs | Consumers: $CONSUMERS | DLQ: $DLQ | Postgres: $PG_COUNT summarized"

  if [ "$QUEUE_DEPTH" -lt "$REFILL_THRESHOLD" ] && [ "$QUEUE_DEPTH" -gt 0 ]; then
    echo "⚠️  REFILL ALERT: Queue at $QUEUE_DEPTH (threshold: $REFILL_THRESHOLD)"
    echo "Run: node sveltekit-frontend/scripts/atlas/phase7-rabbitmq-summary-queue.mjs --produce --batch=500 --limit=2000"
  fi

  if [ "$QUEUE_DEPTH" -eq 0 ] && [ "$DLQ" -eq 0 ]; then
    echo "✅ PHASE 7 COMPLETE: All chunks summarized"
    break
  fi

  sleep $CHECK_INTERVAL
done
