#!/usr/bin/env python3
"""
Real-time QLoRA trainer stream.

Listens for reinforcement-learning feedback events in Redis and applies
LoRA updates against the base Gemma3 model. After each flush it exports
the adapter weights, records the checkpoint for the merge worker, and
optionally nudges Triton to reload the served adapter.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import torch
from bitsandbytes.optim import AdamW8bit
from peft import LoraConfig, PeftModel, get_peft_model
from redis.asyncio import Redis
from torch.nn.utils import clip_grad_norm_
from transformers import AutoModelForCausalLM, AutoTokenizer

try:
    import tritonclient.http as httpclient  # type: ignore
    from tritonclient.utils import InferenceServerException  # type: ignore
except Exception:  # pragma: no cover - Triton client optional
    httpclient = None  # type: ignore
    InferenceServerException = Exception  # type: ignore


LOGGER = logging.getLogger("phase_h.qlora_trainer")
logging.basicConfig(
    level=os.environ.get("QLORA_STREAM_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
FEEDBACK_STREAM = os.environ.get("RL_FEEDBACK_STREAM", "rl.feedback")

BASE_MODEL_NAME = os.environ.get("QLORA_BASE_MODEL", "google/gemma-2b-it")
INITIAL_ADAPTER_PATH = os.environ.get("QLORA_INITIAL_ADAPTER")
ADAPTER_OUTPUT_DIR = Path(os.environ.get("ADAPTER_ARTIFACT_DIR", "native/autoencoder/artifacts"))
ADAPTER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TRITON_URL = os.environ.get("TRITON_URL")
TRITON_MODEL_NAME = os.environ.get("TRITON_MODEL_NAME", "gemma3_legal")

MAX_SEQ_LENGTH = int(os.environ.get("QLORA_MAX_SEQ", "1024"))
BATCH_SIZE = int(os.environ.get("QLORA_BATCH_SIZE", "4"))
GRADIENT_ACCUM = int(os.environ.get("QLORA_GRAD_ACCUM", "8"))
LEARNING_RATE = float(os.environ.get("QLORA_LR", "1e-4"))
FLUSH_INTERVAL = float(os.environ.get("QLORA_FLUSH_SECONDS", "120"))
MAX_CHECKPOINTS = int(os.environ.get("QLORA_MAX_CHECKPOINTS", "5"))
GRAD_CLIP = float(os.environ.get("QLORA_GRAD_CLIP", "1.0"))


@dataclass
class FeedbackExample:
    adapter: str
    prompt: str
    response: str
    reward: float
    metadata: Dict[str, object]

    @property
    def reward_scale(self) -> float:
        # clamp reward into [-1, 1] and shift into [0.25, 1.75] to keep gradients stable
        clamped = max(-1.0, min(1.0, self.reward))
        return 1.0 + (clamped * 0.75)


class QLoRATrainerStream:
    def __init__(self) -> None:
        self.redis: Redis = Redis.from_url(REDIS_URL, decode_responses=True)
        self.feedback_buffer: List[FeedbackExample] = []
        self.last_flush_ts = time.time()

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.dtype = torch.float16 if self.device.type == "cuda" else torch.float32

        self.tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_NAME,
            device_map="auto" if self.device.type == "cuda" else None,
            torch_dtype=self.dtype,
            load_in_8bit=self.device.type == "cuda",
        )

        self.model = self._attach_lora(self.model)

        if INITIAL_ADAPTER_PATH:
            try:
                self.model = PeftModel.from_pretrained(self.model, INITIAL_ADAPTER_PATH)
                LOGGER.info("Loaded initial adapter weights from %s", INITIAL_ADAPTER_PATH)
            except Exception as exc:
                LOGGER.warning("Failed to load initial adapter %s: %s", INITIAL_ADAPTER_PATH, exc)

        self.optimizer = AdamW8bit(self.model.parameters(), lr=LEARNING_RATE)
        self._global_step = 0
        self.stop_event = asyncio.Event()

        self.triton_client = None
        if TRITON_URL and httpclient:
            try:
                self.triton_client = httpclient.InferenceServerClient(url=TRITON_URL)
                LOGGER.info("Connected to Triton at %s", TRITON_URL)
            except Exception as exc:  # pragma: no cover - remote service optional
                LOGGER.warning("Failed to connect to Triton at %s: %s", TRITON_URL, exc)

    def _attach_lora(self, model: AutoModelForCausalLM) -> PeftModel:
        config = LoraConfig(
            r=16,
            lora_alpha=32,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
        )
        return get_peft_model(model, config)

    async def run(self) -> None:
        LOGGER.info("QLoRA trainer stream starting (stream=%s)", FEEDBACK_STREAM)
        try:
            while not self.stop_event.is_set():
                entries = await self.redis.xread(
                    streams={FEEDBACK_STREAM: "$"},
                    count=BATCH_SIZE * 2,
                    block=5000,
                )
                if entries:
                    await self._handle_entries(entries)

                if self.feedback_buffer and (time.time() - self.last_flush_ts) > FLUSH_INTERVAL:
                    await self._flush()
        finally:
            await self.redis.close()
            LOGGER.info("QLoRA trainer stopped")

    def request_stop(self) -> None:
        self.stop_event.set()

    async def _handle_entries(self, entries) -> None:
        for stream_name, events in entries:
            if stream_name != FEEDBACK_STREAM:
                continue
            for event_id, payload in events:
                example = self._parse_feedback(payload)
                if example:
                    self.feedback_buffer.append(example)
                await self.redis.xdel(stream_name, event_id)

                if len(self.feedback_buffer) >= BATCH_SIZE:
                    await self._flush()

    def _parse_feedback(self, payload: Dict[str, str]) -> Optional[FeedbackExample]:
        adapter = payload.get("adapter") or payload.get("adapterName") or "default"
        prompt = payload.get("prompt") or payload.get("query")
        response = payload.get("response") or payload.get("answer")
        reward_raw = payload.get("reward") or payload.get("score") or "0"

        if not prompt or not response:
            return None

        try:
            reward = float(reward_raw)
        except ValueError:
            reward = 0.0

        metadata_raw = payload.get("metadata")
        if metadata_raw:
            try:
                metadata = json.loads(metadata_raw)
            except Exception:
                metadata = {}
        else:
            metadata = {}

        return FeedbackExample(adapter=adapter, prompt=prompt, response=response, reward=reward, metadata=metadata)

    async def _flush(self) -> None:
        batch = self.feedback_buffer[:]
        self.feedback_buffer.clear()

        if not batch:
            return

        LOGGER.info("Training on %d feedback samples", len(batch))
        self.model.train()

        accumulation = 0
        for example in batch:
            loss = self._train_example(example)
            accumulation += 1
            if accumulation >= GRADIENT_ACCUM:
                self._optimizer_step()
                accumulation = 0

        if accumulation > 0:
            self._optimizer_step()

        save_path = self._save_adapter()
        await self._record_checkpoint(save_path)
        await self._notify_triton()

        self.last_flush_ts = time.time()
        LOGGER.info("Batch flushed; adapter saved to %s", save_path)

    def _train_example(self, example: FeedbackExample) -> float:
        text = self._format_example(example)
        encoding = self.tokenizer(
            text,
            truncation=True,
            max_length=MAX_SEQ_LENGTH,
            return_tensors="pt",
        )
        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)

        labels = input_ids.clone()
        outputs = self.model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
        loss = outputs.loss * example.reward_scale

        loss.backward()
        return float(loss.detach().cpu())

    def _optimizer_step(self) -> None:
        clip_grad_norm_(self.model.parameters(), GRAD_CLIP)
        self.optimizer.step()
        self.optimizer.zero_grad(set_to_none=True)
        self._global_step += 1

    def _format_example(self, example: FeedbackExample) -> str:
        system_prompt = example.metadata.get("system_prompt") if isinstance(example.metadata, dict) else None
        base = []
        if system_prompt and isinstance(system_prompt, str):
            base.append(f"[SYSTEM]\n{system_prompt}\n")
        base.append(f"[PROMPT]\n{example.prompt.strip()}\n")
        base.append(f"[RESPONSE]\n{example.response.strip()}\n")
        base.append(f"[REWARD]\n{example.reward:.3f}\n")
        return "\n".join(base)

    def _save_adapter(self) -> Path:
        timestamp = int(time.time())
        adapter_name = f"qlora_adapter_step{self._global_step}_{timestamp}"
        save_dir = ADAPTER_OUTPUT_DIR / adapter_name
        save_dir.mkdir(parents=True, exist_ok=True)

        self.model.save_pretrained(save_dir)
        self.tokenizer.save_pretrained(save_dir)
        LOGGER.info("Adapter checkpoint written to %s", save_dir)

        # enforce retention
        existing = sorted(ADAPTER_OUTPUT_DIR.glob("qlora_adapter_step*"), key=os.path.getmtime, reverse=True)
        for obsolete in existing[MAX_CHECKPOINTS:]:
            try:
                for child in obsolete.glob("**/*"):
                    if child.is_file():
                        child.unlink()
                obsolete.rmdir()
            except Exception:
                LOGGER.debug("Failed to prune old adapter %s", obsolete)

        return save_dir

    async def _record_checkpoint(self, save_path: Path) -> None:
        try:
            await self.redis.sadd("adapters:checkpoints", str(save_path))
            await self.redis.set("adapters:latest:qlora", str(save_path))
        except Exception as exc:  # pragma: no cover - redis hiccups
            LOGGER.warning("Could not publish adapter checkpoint: %s", exc)

    async def _notify_triton(self) -> None:
        if not self.triton_client or not TRITON_MODEL_NAME:
            return
        try:
            self.triton_client.repository_model_load(TRITON_MODEL_NAME)
            LOGGER.info("Requested Triton reload for model %s", TRITON_MODEL_NAME)
        except InferenceServerException as exc:  # pragma: no cover
            LOGGER.warning("Triton reload failed: %s", exc)


async def _run_trainer() -> None:
    trainer = QLoRATrainerStream()

    loop = asyncio.get_running_loop()

    def _handle_signal(*_: object) -> None:
        LOGGER.info("Received shutdown signal")
        trainer.request_stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:  # pragma: no cover - Windows fallback
            signal.signal(sig, lambda *_: trainer.request_stop())

    await trainer.run()


if __name__ == "__main__":
    asyncio.run(_run_trainer())
