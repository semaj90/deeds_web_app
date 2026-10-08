"""Async DAG worker reference: read-only, bounded, stale-result fail-closed.

Not an event store, queue daemon, cache writer or GPU owner. The caller
supplies an authoritative compare-and-swap claim and a revision readback.
"""
from __future__ import annotations
import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable, Any

@dataclass(frozen=True)
class WorkerBinding:
    run_id: str
    step_id: str
    dag_revision: str
    source_revision: str
    workspace_revision: str
    graph_revision: str
    model_revision: str
    lease_id: str
    claim_generation: int

@dataclass(frozen=True)
class WorkerResult:
    status: str
    binding: WorkerBinding
    payload: Any | None
    reason: str | None = None

def validate_binding(bound: WorkerBinding, current: WorkerBinding) -> None:
    if not all((bound.run_id,bound.step_id,bound.dag_revision,bound.source_revision,
                bound.workspace_revision,bound.graph_revision,bound.model_revision,
                bound.lease_id)) or bound.claim_generation < 1:
        raise ValueError("WORKER_BINDING_INCOMPLETE")
    if bound != current:
        raise ValueError("WORKER_STALE_BINDING")

class AsyncDagWorker:
    def __init__(self, *, io_limit: int = 8, cpu_limit: int = 2, gpu_limit: int = 1):
        if min(io_limit,cpu_limit,gpu_limit) < 1:
            raise ValueError("WORKER_LIMIT_INVALID")
        self._limits={"io":asyncio.Semaphore(io_limit),
                      "cpu":asyncio.Semaphore(cpu_limit),
                      "gpu":asyncio.Semaphore(gpu_limit)}

    async def run(self, *, kind: str, binding: WorkerBinding,
                  claim: Callable[[WorkerBinding], Awaitable[bool]],
                  read_current: Callable[[WorkerBinding], Awaitable[WorkerBinding]],
                  operation: Callable[[], Awaitable[Any]],
                  timeout_seconds: float = 30.) -> WorkerResult:
        if kind not in self._limits or timeout_seconds <= 0:
            raise ValueError("WORKER_KIND_OR_TIMEOUT_INVALID")
        # claim must atomically validate READY->RUNNING, lease, generation and
        # dependency completion in the external authoritative state owner.
        if not await claim(binding):
            return WorkerResult("REJECTED",binding,None,"CLAIM_DENIED")
        async with self._limits[kind]:
            try:
                validate_binding(binding,await read_current(binding))
                async with asyncio.timeout(timeout_seconds):
                    payload=await operation()
                validate_binding(binding,await read_current(binding))
            except ValueError as exc:
                return WorkerResult("STALE",binding,None,str(exc))
            except (TimeoutError,asyncio.CancelledError):
                return WorkerResult("FAILED",binding,None,"TIMEOUT_OR_CANCELLED")
            except Exception as exc:
                return WorkerResult("FAILED",binding,None,type(exc).__name__)
            # SUCCEEDED is deliberately not emitted: persistence, readback and
            # final compare-and-swap must happen at the external receipt owner.
            return WorkerResult("PROPOSED",binding,payload)
