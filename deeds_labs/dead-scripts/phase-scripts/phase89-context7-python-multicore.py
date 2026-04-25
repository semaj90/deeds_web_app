
import os
import time
import torch
import torch.multiprocessing as mp
import uvicorn
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any

# Set start method to spawn for CUDA compatibility and GIL bypassing
try:
    mp.set_start_method('spawn', force=True)
except RuntimeError:
    pass

app = FastAPI(title="Context7 Multi-Core Python Server")

# -----------------------------------------------------------------------------
# Worker Function (Runs in separate process, bypasses GIL)
# -----------------------------------------------------------------------------
def worker_task(rank: int, task_queue: mp.Queue, result_queue: mp.Queue):
    print(f"[Worker {rank}] Started. CUDA Available: {torch.cuda.is_available()}")

    # Simulate loading a model or heavyweight resource per process if needed
    # Or rely on shared memory for large tensors

    while True:
        task = task_queue.get()
        if task is None:
            break  # Poison pill

        task_id = task.get("id")
        payload = task.get("payload")

        start_time = time.time()

        # --- Heavy Computation (CPU or GPU) ---
        # This runs in parallel with other workers!

        result = None
        if task.get("type") == "matrix_mult":
            # GPU efficient task
            size = payload.get("size", 1000)
            if torch.cuda.is_available():
                a = torch.randn(size, size, device=f"cuda:0")
                b = torch.randn(size, size, device=f"cuda:0")
                c = torch.matmul(a, b)
                result = {"shape": c.shape, "device": str(c.device), "mean": c.mean().item()}
            else:
                result = {"error": "CUDA not available"}

        elif task.get("type") == "cpu_crunch":
            # CPU intensive task (GIL would block this in threads, but not here)
            # e.g. complex parsing or JSON analysis
            count = payload.get("count", 10000000)
            x = 0
            for i in range(count):
                x += i
            result = {"sum": x}

        else:
            result = {"error": "Unknown task type"}

        duration = time.time() - start_time
        result_queue.put({"id": task_id, "worker": rank, "result": result, "duration": duration})

# -----------------------------------------------------------------------------
# Manager
# -----------------------------------------------------------------------------
class WorkerManager:
    def __init__(self, num_workers=4):
        self.num_workers = num_workers
        self.task_queue = mp.Queue()
        self.result_queue = mp.Queue()
        self.workers = []

    def start(self):
        for i in range(self.num_workers):
            p = mp.Process(target=worker_task, args=(i, self.task_queue, self.result_queue))
            p.start()
            self.workers.append(p)
        print(f"✅ Context7: Started {self.num_workers} GIL-free workers")

    def stop(self):
        for _ in range(self.num_workers):
            self.task_queue.put(None)
        for p in self.workers:
            p.join()

    def submit(self, task: Dict[str, Any]):
        self.task_queue.put(task)

    def get_result(self, timeout=None):
        if not self.result_queue.empty():
            return self.result_queue.get(timeout=timeout)
        return None

manager = WorkerManager(num_workers=4) # Scalable based on CPU cores

# -----------------------------------------------------------------------------
# API
# -----------------------------------------------------------------------------
class TaskRequest(BaseModel):
    type: str
    payload: Dict[str, Any] = {}

@app.on_event("startup")
async def startup_event():
    manager.start()

@app.on_event("shutdown")
async def shutdown_event():
    manager.stop()

@app.post("/submit")
async def submit_task(task: TaskRequest):
    task_id = str(time.time())
    manager.submit({"id": task_id, "type": task.type, "payload": task.payload})
    return {"status": "submitted", "task_id": task_id}

@app.get("/results")
async def get_results():
    results = []
    # Drain available results
    while True:
        res = manager.get_result()
        if res:
            results.append(res)
        else:
            break
    return {"count": len(results), "results": results}

@app.get("/health")
def health():
    return {"status": "ok", "workers": manager.num_workers, "cuda": torch.cuda.is_available()}

if __name__ == "__main__":
    # Running this script directly starts the server
    uvicorn.run(app, host="0.0.0.0", port=3007)
