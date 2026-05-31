const WorkerPool = require('../../simd-bridge/worker-pool.cjs');
const path = require('path');
(async ()=>{
  const pool = new WorkerPool(path.join(process.cwd(),'simd-bridge','worker.cjs'), 1);
  try{
    const slice = ['{"ok": true}', 'not-json'];
    console.log('Sending slice to worker...');
    const out = await pool.exec({ type: 'parse', contents: slice });
    console.log('Worker returned:', out);
  }catch(e){ console.error('Worker exec err:', e); }
  pool.destroy();
})();
