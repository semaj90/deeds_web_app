import { connect, StringCodec } from 'nats';
import http from 'http';

const sc = StringCodec();

async function checkGoSidecar() {
  console.log("🔍 Checking Go Retrieval Sidecar (HTTP :8100)...");
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:8100/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log("✅ Go Retrieval Sidecar is ONLINE.");
          resolve(true);
        } else {
          console.log(`❌ Go Retrieval Sidecar returned status ${res.statusCode}`);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.log(`❌ Go Retrieval Sidecar is OFFLINE: ${err.message}`);
      resolve(false);
    });
  });
}

async function checkNATS() {
  console.log("🔍 Checking NATS Broker & Agent Worker (nats://127.0.0.1:4222)...");
  try {
    const nc = await connect({ servers: 'nats://127.0.0.1:4222', timeout: 2000 });
    console.log("✅ NATS Broker is ONLINE.");
    
    // Check if worker is listening
    console.log("📡 Sending test task to 'agent.task.execute'...");
    
    try {
      const resp = await nc.request('agent.task.execute', sc.encode(JSON.stringify({
        taskId: 'health-check-001',
        query: 'test ping',
        ctx: { intent: 'ping' }
      })), { timeout: 2000 });
      
      const result = JSON.parse(sc.decode(resp.data));
      console.log(`✅ Agent Worker responded successfully:`, result.success);
      await nc.close();
      return true;
    } catch (err) {
      console.log(`⚠️ NATS is online, but Agent Worker did not respond in time (timeout). Is the worker running?`);
      await nc.close();
      return false;
    }
  } catch (err) {
    console.log(`❌ NATS Broker is OFFLINE: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("🚀 Starting Distributed Mesh Validation...\n");
  
  const goOk = await checkGoSidecar();
  const natsOk = await checkNATS();
  
  console.log("\n📊 Mesh Validation Results:");
  console.log(`- Go Sidecar: ${goOk ? 'PASS' : 'FAIL'}`);
  console.log(`- NATS/Worker: ${natsOk ? 'PASS' : 'FAIL'}`);
  
  if (!goOk || !natsOk) {
    console.log("\n⚠️ Mesh is degraded. Some execution lanes may fail.");
    process.exit(1);
  } else {
    console.log("\n✅ Full Distributed Mesh is operational!");
  }
}

main().catch(console.error);
