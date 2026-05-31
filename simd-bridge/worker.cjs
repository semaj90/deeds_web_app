const { parentPort } = require('worker_threads');
const path = require('path');

let native = null;
try{
  const candidate = path.join(__dirname, 'rust-simdjson', 'target', 'release', 'simd_bridge_rs.node');
  native = require(candidate);
}catch(e){ native = null; }

parentPort.on('message', async (msg) => {
  const id = msg.id || null;
  try{
    if(msg.type === 'parse' && Array.isArray(msg.contents)){
      // try native parse_batch / parseBatch
      if(native && (typeof native.parseBatch === 'function' || typeof native.parse_batch === 'function')){
        const fn = native.parseBatch || native.parse_batch;
        try{
          const out = fn(msg.contents);
          // If native returns an array, return it directly
          if(Array.isArray(out)){
            parentPort.postMessage({ id, result: { success: true, parsedCount: out.length, result: out } });
            return;
          }
          // If native returned something unexpected, fall through to per-item fallback
        }catch(e){
          // fall back to per-item parse below
        }
      }
      // fallback
      const parsed = [];
      for(const t of msg.contents){
        try{ parsed.push(JSON.parse(t)); }catch(e){ parsed.push(null); }
      }
      parentPort.postMessage({ id, result: { success: true, parsedCount: parsed.filter(Boolean).length, result: parsed } });
      return;
    }
    // unknown
    parentPort.postMessage({ id, result: { success: false, error: 'unknown message' } });
  }catch(err){ parentPort.postMessage({ id, result: { success: false, error: String(err) } }); }
});
