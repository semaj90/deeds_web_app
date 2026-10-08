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
if __name__=="__main__":unittest.main()
