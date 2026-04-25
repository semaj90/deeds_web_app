"""Redis-backed GRPO training loop scaffold. This worker consumes feedback messages pushed by the orchestrator
(`redis.publish("rl.feedback", ...)` or queue) and performs lightweight gradient updates on QLoRA adapters. It is
intentionally minimal—extend with project-specific reward shaping and logging. """ from __future__ import annotations
import argparse import json import logging import pathlib import time from typing import Any import torch try: import
redis except ImportError as exc: # pragma: no cover - optional dependency raise SystemExit("redis-py must be installed
to run rl_train_worker.py") from exc try: from transformers import AutoModelForCausalLM, AutoTokenizer from peft import
PeftModel except ImportError as exc: # pragma: no cover - optional dependency raise SystemExit("transformers and peft
are required for RL training") from exc LOGGER = logging.getLogger("rl_worker") def parse_args() -> argparse.Namespace:
parser = argparse.ArgumentParser(description="GRPO-style QLoRA reinforcement worker") parser.add_argument("--redis-url",
type=str, default="redis://localhost:6379/0") parser.add_argument("--queue", type=str, default="rl.feedback")
parser.add_argument("--base-model", type=str, default="google/gemma3-legal") parser.add_argument("--adapter-path",
type=pathlib.Path, default=pathlib.Path("adapters/legal_qlora_adapter")) parser.add_argument("--save-every", type=int,
default=100, help="Persist adapter every N updates") parser.add_argument("--device", type=str, default=None) return
parser.parse_args() def load_models(base_model: str, adapter_path: pathlib.Path, device: str) -> tuple[Any, Any]:
tokenizer = AutoTokenizer.from_pretrained(base_model) model = AutoModelForCausalLM.from_pretrained(base_model,
torch_dtype=torch.float16 if device.startswith("cuda") else None) if adapter_path.exists(): LOGGER.info("Loading adapter
weights from %s", adapter_path) model = PeftModel.from_pretrained(model, adapter_path) model.to(device) model.train()
return model, tokenizer def apply_feedback(model: Any, tokenizer: Any, payload: dict[str, Any], device: str) -> float:
"""Apply a single GRPO-style update and return the reward used.""" query = payload.get("query", "") reward =
float(payload.get("reward", 0.0)) if not query: return 0.0 inputs = tokenizer(query, return_tensors="pt").to(device)
outputs = model(**inputs, labels=inputs["input_ids"]) loss = outputs.loss - reward loss.backward() return reward def
main() -> None: logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s") args = parse_args() device
= args.device or ("cuda" if torch.cuda.is_available() else "cpu") model, tokenizer = load_models(args.base_model,
args.adapter_path, device) optimizer = torch.optim.Adam(model.parameters(), lr=5e-5) client =
redis.Redis.from_url(args.redis_url) LOGGER.info("Listening for feedback on Redis list %s", args.queue) processed = 0
while True: try: _, raw_payload = client.blpop(args.queue) except redis.ConnectionError as exc: # pragma: no cover
LOGGER.error("Redis connection lost: %s", exc) time.sleep(2) continue try: payload = json.loads(raw_payload) except
json.JSONDecodeError: LOGGER.warning("Malformed payload: %s", raw_payload) continue
optimizer.zero_grad(set_to_none=True) reward = apply_feedback(model, tokenizer, payload, device) optimizer.step()
processed += 1 LOGGER.info("Processed feedback reward=%.4f total_updates=%d", reward, processed) if processed %
args.save_every == 0: LOGGER.info("Persisting adapter checkpoint to %s", args.adapter_path)
args.adapter_path.mkdir(parents=True, exist_ok=True) model.save_pretrained(args.adapter_path) if __name__ == "__main__":
# pragma: no cover main()
