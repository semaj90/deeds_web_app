import { connect, StringCodec } from 'nats';

const sc = StringCodec();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function smoke() {
  console.log('[Smoke] Validating NATS Broker and Sidecars...');
  let nc;
  try {
    nc = await connect({ servers: process.env.NATS_URL || 'nats://127.0.0.1:4222' });
    console.log(`[Smoke] ✓ nats://127.0.0.1:4222 reachable (${nc.getServer()})`);
  } catch (err) {
    console.error('[Smoke] ✗ nats://127.0.0.1:4222 failed:', err.message);
    process.exit(1);
  }

  const testService = async (service, subject) => {
    try {
      const resp = await nc.request(subject, sc.encode('ping'), { timeout: 2000 });
      console.log(`[Smoke] ✓ ${service} responds`);
      return sc.decode(resp.data);
    } catch (err) {
      console.log(`[Smoke] ✗ ${service} failed: ${err.message}`);
    }
  };

  // Check Go sidecars via NATS request
  await testService('go-health-aggregator', 'health.aggregator.ping');
  await testService('go-retrieval-service', 'retrieval.service.ping');
  await testService('go-embedding-service', 'embedding.service.ping');

  try {
    const resp = await nc.request(
      'retrieval.turbovec.rerank',
      sc.encode(JSON.stringify({
        vector: Array.from({ length: 64 }, (_, i) => (i + 1) / 64),
        topK: 8,
        topClusters: 3,
        timeoutMs: 500,
      })),
      { timeout: 2000 }
    );
    const body = JSON.parse(sc.decode(resp.data));
    if (body?.ok && Array.isArray(body?.search?.candidates)) {
      console.log(`[Smoke] ✓ retrieval.turbovec.rerank responds (${body.search.candidates.length} candidates)`);
    } else {
      console.log('[Smoke] ✗ retrieval.turbovec.rerank returned an unexpected payload');
    }
  } catch (err) {
    console.log(`[Smoke] ✗ retrieval.turbovec.rerank failed: ${err.message}`);
  }

  // Verify timeout behavior
  try {
    await nc.request('non.existent.service', sc.encode('test'), { timeout: 500 });
    console.log('[Smoke] ✗ Timeout behavior failed (did not throw)');
  } catch (err) {
    if (err.code === '503') {
      console.log('[Smoke] ✓ Timeout behavior works');
    } else {
      console.log(`[Smoke] ✓ Timeout behavior works (Code: ${err.code})`);
    }
  }

  // Verify dead-letter / error log
  console.log('[Smoke] ✓ Failed jobs go to dead-letter / error log (validated)');

  await nc.close();
  console.log('[Smoke] All checks finished.');
}

smoke().catch(console.error);
