import asyncio
import unittest
from atlas_compute.async_dag_worker_v1 import AsyncDagWorker,WorkerBinding

def binding():
    return WorkerBinding("run","step","dag1","sr1","wr1","gr1","model1","lease",1)
class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_proposed_only(self):
        b=binding()
        async def yes(_):return True
        async def read(_):return b
        async def op():return {"rank":3}
        r=await AsyncDagWorker().run(kind="io",binding=b,claim=yes,read_current=read,operation=op)
        self.assertEqual(r.status,"PROPOSED")
    async def test_stale_detected_after_await(self):
        b=binding();calls=0
        async def yes(_):return True
        async def read(_):
            nonlocal calls
            calls+=1
            return b if calls==1 else WorkerBinding("run","step","dag1","sr2","wr1","gr1","model1","lease",1)
        async def op():await asyncio.sleep(0);return 42
        r=await AsyncDagWorker().run(kind="cpu",binding=b,claim=yes,read_current=read,operation=op)
        self.assertEqual(r.status,"STALE")
        self.assertIsNone(r.payload)

    async def test_concurrent_jobs_bounded_by_semaphore(self):
        worker = AsyncDagWorker(io_limit=2, cpu_limit=1, gpu_limit=1)
        active = 0
        max_active = 0

        async def yes(_): return True
        async def read(cur): return cur

        async def op():
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.02)
            active -= 1
            return "ok"

        bindings = [
            WorkerBinding("run", f"step-{i}", "dag1", "sr1", "wr1", "gr1", "model1", f"lease-{i}", 1)
            for i in range(5)
        ]
        results = await asyncio.gather(*(
            worker.run(kind="io", binding=bnd, claim=yes, read_current=read, operation=op)
            for bnd in bindings
        ))
        self.assertEqual(max_active, 2)
        self.assertTrue(all(r.status == "PROPOSED" for r in results))

    async def test_timeout_returns_failed(self):
        b = binding()
        async def yes(_): return True
        async def read(_): return b
        async def slow_op():
            await asyncio.sleep(0.2)
            return "late"
        r = await AsyncDagWorker().run(kind="io", binding=b, claim=yes, read_current=read, operation=slow_op, timeout_seconds=0.01)
        self.assertEqual(r.status, "FAILED")
        self.assertEqual(r.reason, "TIMEOUT_OR_CANCELLED")
        self.assertIsNone(r.payload)

    async def test_cancellation_returns_failed(self):
        b = binding()
        async def yes(_): return True
        async def read(_): return b
        async def cancelled_op():
            raise asyncio.CancelledError()
        r = await AsyncDagWorker().run(kind="io", binding=b, claim=yes, read_current=read, operation=cancelled_op)
        self.assertEqual(r.status, "FAILED")
        self.assertEqual(r.reason, "TIMEOUT_OR_CANCELLED")

    async def test_out_of_order_completion_preserves_bindings(self):
        worker = AsyncDagWorker(io_limit=4, cpu_limit=2, gpu_limit=1)
        async def yes(_): return True
        async def read(cur): return cur

        async def run_item(idx: int, delay: float):
            bnd = WorkerBinding("run", f"step-{idx}", "dag1", "sr1", "wr1", "gr1", "model1", f"lease-{idx}", 1)
            async def op():
                await asyncio.sleep(delay)
                return idx
            return await worker.run(kind="io", binding=bnd, claim=yes, read_current=read, operation=op)

        results = await asyncio.gather(run_item(0, 0.03), run_item(1, 0.005), run_item(2, 0.015))
        self.assertEqual([r.binding.step_id for r in results], ["step-0", "step-1", "step-2"])
        self.assertEqual([r.payload for r in results], [0, 1, 2])

    async def test_claim_denied_returns_rejected(self):
        b = binding()
        async def no(_): return False
        async def read(_): return b
        async def op(): return 1
        r = await AsyncDagWorker().run(kind="io", binding=b, claim=no, read_current=read, operation=op)
        self.assertEqual(r.status, "REJECTED")
        self.assertEqual(r.reason, "CLAIM_DENIED")
if __name__=="__main__":unittest.main()
