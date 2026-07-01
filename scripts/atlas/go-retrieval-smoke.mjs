#!/usr/bin/env node
/**
 * Read-only Go Retrieval smoke.
 *
 * Proves the existing Go search/retrieval sidecar is reachable on HTTP and
 * gRPC/TCP without mutating packet truth, Qdrant mirrors, or Redis cache.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { loadRepoEnv, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv();
const httpUrl = String(env.GO_RETRIEVAL_HTTP_URL ?? env.RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100').replace(/\/+$/, '');
const grpcAddr = String(env.GO_RETRIEVAL_GRPC_ADDR ?? env.RETRIEVAL_GRPC_URL ?? '127.0.0.1:50053').replace(/^https?:\/\//, '');
const [grpcHost, grpcPortRaw] = grpcAddr.split(':');
const grpcPort = Number(grpcPortRaw || env.RETRIEVAL_GRPC_PORT || 50053);
const out = path.resolve(REPO_ROOT, 'docs/reports/go-retrieval-smoke.json');
const outMd = path.resolve(REPO_ROOT, 'docs/reports/go-retrieval-smoke.md');

async function httpHealth() {
  const started = Date.now();
  const res = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(5000) });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }
  return {
    ok: res.ok,
    status: res.status,
    elapsed_ms: Date.now() - started,
    body,
  };
}

function tcpProbe(host, port) {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ...result, elapsed_ms: Date.now() - started });
    };
    socket.once('connect', () => finish({ ok: true }));
    socket.once('error', (error) => finish({ ok: false, error: error.message }));
    socket.setTimeout(5000, () => finish({ ok: false, error: 'TCP timeout after 5000ms' }));
  });
}

function markdown(report) {
  return [
    '# Go Retrieval Smoke',
    '',
    `Status: ${report.status}`,
    `Generated: ${report.generated_at}`,
    '',
    `- HTTP: ${report.http.ok ? 'READY' : 'FAIL'} ${httpUrl}/health (${report.http.elapsed_ms}ms)`,
    `- gRPC/TCP: ${report.grpc.ok ? 'READY' : 'FAIL'} ${grpcHost}:${grpcPort} (${report.grpc.elapsed_ms}ms)`,
    '',
    '## HTTP Health',
    '',
    '```json',
    JSON.stringify(report.http.body, null, 2),
    '```',
    '',
  ].join('\n');
}

const report = {
  generated_at: new Date().toISOString(),
  http_url: httpUrl,
  grpc_addr: `${grpcHost}:${grpcPort}`,
  status: 'FAIL',
  http: { ok: false },
  grpc: { ok: false },
};

try {
  report.http = await httpHealth();
} catch (error) {
  report.http = { ok: false, error: error.message };
}

report.grpc = await tcpProbe(grpcHost || '127.0.0.1', grpcPort);
report.status = report.http.ok && report.grpc.ok ? 'PASS' : 'FAIL';

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
fs.writeFileSync(outMd, markdown(report), 'utf8');

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);
