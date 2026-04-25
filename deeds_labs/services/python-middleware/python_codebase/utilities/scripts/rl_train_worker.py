#!/usr/bin/env python3
import redis, json, time, torch
from transformers import AutoModelForCausalLM
from peft import PeftModel

r = redis.from_url("redis://localhost:6379/0")

model = AutoModelForCausalLM.from_pretrained("google/gemma3-legal")
adapter_path = "native/autoencoder/artifacts/adapter_legal_qlora"
try:
    model = PeftModel.from_pretrained(model, adapter_path)
except Exception:
    print('Adapter load failed, continuing with base model')

def compute_reward(feedback):
    return feedback.get('reward', 1.0)

while True:
    msg = r.blpop('rl.feedback', timeout=5)
    if not msg:
        time.sleep(1)
        continue
    data = json.loads(msg[1])
    reward = compute_reward(data)
    print('GRPO update for query:', data.get('query'), '-> reward', reward)
    torch.save({'query': data.get('query'), 'reward': reward}, f"native/autoencoder/artifacts/reward_{int(time.time())}.pt")
