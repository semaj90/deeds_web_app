#!/usr/bin/env python3
"""Simple replay script to generate synthetic analytics and rewards for testing the adaptive loop."""
import time
import random
import json
from redis import Redis

r = Redis.from_url("redis://localhost:6379/0", decode_responses=True)
actions = ["view_contract", "summarize_contract", "upload_evidence", "ask_legal"]
adapters = ["legal", "contract", "evidence", "summary"]

try:
    while True:
        uid = f"user_{random.randint(1, 50)}"
        action = random.choice(actions)
        adapter = random.choice(adapters)
        reward = round(random.uniform(0.0, 1.0), 3)
        event = {"userId": uid, "action": action, "adapter": adapter, "reward": reward}
        r.xadd("user.analytics", {"data": json.dumps(event)})
        r.xadd("rl.feedback", {"data": json.dumps(event)})
        print("Pushed", event)
        time.sleep(1)
except KeyboardInterrupt:
    print("Stopped")
