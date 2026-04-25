#!/usr/bin/env node
/**
 * Lightweight watchdog that keeps the GPU/WASM integration endpoint warm
 * while `npm run dev:quic` is running.
 */
const endpoint = process.env.GPU_WASM_ENDPOINT ?? 'http://localhost:5173/api/gpu-wasm-integration';
const action = process.env.GPU_WASM_ACTION ?? 'status';
const intervalMs = Number(process.env.GPU_WASM_POLL_MS ?? 15000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let isRunning = true;

process.on('SIGINT', () => {
  isRunning = false;
  console.log('\n[gpu-wasm-watch] Received SIGINT, shutting down.');
});

process.on('SIGTERM', () => {
  isRunning = false;
  console.log('\n[gpu-wasm-watch] Received SIGTERM, shutting down.');
});

async function probe() {
  const payload = { action };
  const started = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    const duration = Date.now() - started;
    if (!res.ok) {
      console.error(
        `[gpu-wasm-watch] ERR HTTP ${res.status} ${res.statusText} (after ${duration}ms)`
      );
      return;
    }

    const data = await res.json().catch(() => ({ status: 'unknown' }));
    const statusLabel = data.status ?? data.result ?? 'ok';
    console.log(
      `[gpu-wasm-watch] OK ${statusLabel} (${duration}ms) @ ${new Date().toLocaleTimeString()}`
    );
  } catch (error) {
    console.error(
      `[gpu-wasm-watch] WARN ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

(async function main() {
  console.log(
    `[gpu-wasm-watch] Monitoring ${endpoint} (action="${action}", interval=${intervalMs}ms)`
  );

  while (isRunning) {
    await probe();
    await sleep(intervalMs);
  }
})();
