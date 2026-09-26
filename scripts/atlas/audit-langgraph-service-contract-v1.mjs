#!/usr/bin/env node
/**
 * Read-only contract audit for the LangGraph synthesis sidecar.
 *
 * This is intentionally static: it does not start containers or call backing
 * stores. Runtime health remains a separate, explicit smoke gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] ?? '.');
const reportPath = path.resolve(
  process.argv[3] ?? 'docs/reports/langgraph-service-contract-v1.json',
);

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('docker/langgraph-synthesis/app.py');
const dockerfile = read('docker/langgraph-synthesis/Dockerfile');
const compose = read('docker-compose.yml');

const count = (text, pattern) => (text.match(pattern) ?? []).length;
const checks = [];
const check = (id, passed, detail) => {
  checks.push({ id, status: passed ? 'PASS' : 'FAIL', detail });
};

check(
  'HEALTH_SINGLE_AUTHORITATIVE',
  count(app, /@app\.get\("\/health"\)/g) === 1 && count(app, /@app\.get\("\/health\/summary"\)/g) === 1,
  'exactly one detailed /health route plus one explicitly named /health/summary route',
);
check(
  'HEALTHCHECK_TARGET',
  /curl -f http:\/\/localhost:8091\/health/.test(dockerfile) && /curl -f http:\/\/localhost:8091\/health/.test(compose),
  'container and compose healthchecks target the detailed /health endpoint',
);
check(
  'THREAD_ID_BOUND',
  /thread_id:\s*str \| None\s*=\s*Field\(default=None,\s*max_length=255\)/.test(app),
  'thread_id is bounded and remains workflow identity, not packet identity',
);
check(
  'CHECKPOINT_SETUP_EXPLICIT',
  /if LANGGRAPH_CHECKPOINT_SETUP:\s*\n\s+await checkpointer\.setup\(\)/.test(app),
  'PostgreSQL checkpointer setup requires the explicit setup flag',
);
check(
  'CHECKPOINT_THREAD_REQUIRED',
  /LANGGRAPH_CHECKPOINT_ENABLED and not req\.thread_id/.test(app),
  'enabled checkpointing rejects requests without thread_id',
);
check(
  'INTERNAL_AUTH_BOUNDARY',
  /LANGGRAPH_INTERNAL_API_KEY/.test(app) && /_require_internal_auth/.test(app) && /LANGGRAPH_INTERNAL_API_KEY/.test(compose) &&
    count(app, /_require_internal_auth\(authorization, x_api_key\)/g) >= 6,
  'all non-health routes have an explicit internal-auth boundary with production fail-closed behavior',
);
check(
  'CHAT_OWNER_ORNITH_ENDPOINT',
  /LLAMA_SERVER_URL=\$\{LANGGRAPH_LLAMA_SERVER_URL:-http:\/\/host\.docker\.internal:8090\/v1\}/.test(compose) && /LLAMA_SERVER_MODEL=\$\{LLAMA_SERVER_MODEL:-ornith-1\.5-9b\}/.test(compose),
  'compose defaults chat to llama-server :8090 and ornith-1.5-9b',
);
check(
  'EMBEDDING_OWNER_OLLAMA',
  /OLLAMA_URL=http:\/\/host\.docker\.internal:11434/.test(compose) && /embeddinggemma:latest/.test(compose),
  'compose keeps Ollama :11434 in the EmbeddingGemma lane',
);
check(
  'ORCHESTRATOR_CPU_ONLY',
  /CPU orchestration image/.test(dockerfile) &&
    !/^FROM[^\n]*(?:nvidia|cuda)/im.test(dockerfile) &&
    !/^RUN[^\n]*(?:nvidia|cuda|torch|cuvs|cutile)/im.test(dockerfile),
  'LangGraph image does not duplicate the GPU executor stack',
);
check(
  'CPU_HEALTH_SEMANTICS',
  /CPU-only/.test(app) && /checks\.get\(k\) in \("ok", True\) for k in \(\"qdrant\", \"redis\", \"ollama\"\)/.test(app),
  'CPU-only gpu=false is descriptive and does not degrade dependency readiness',
);
check(
  'NO_DIRECT_CANONICAL_WRITE_MARKER',
  /canonical|authority|write/i.test(app),
  'service source contains explicit authority/write boundary documentation',
);

const passed = checks.filter((item) => item.status === 'PASS').length;
const failed = checks.length - passed;
const inputChecksum = `sha256:${crypto.createHash('sha256').update(app).update(dockerfile).update(compose).digest('hex')}`;
const report = {
  schema: 'atlas.langgraph-service-contract-audit.v1',
  generatedAt: new Date().toISOString(),
  inputChecksum,
  service: {
    port: 8091,
    chatOwner: 'llama-server',
    chatEndpoint: 'http://host.docker.internal:8090/v1',
    chatModel: 'ornith-1.5-9b',
    embeddingOwner: 'ollama',
    embeddingEndpoint: 'http://host.docker.internal:11434',
    checkpointSetup: 'explicit opt-in',
    canonicalAuthority: false,
    writesPerformed: false,
  },
  checks,
  summary: { total: checks.length, passed, failed, status: failed === 0 ? 'CONTRACT_PROVEN' : 'CONTRACT_REVIEW_REQUIRED' },
  runtimeSmoke: { status: 'NOT_RUN', reason: 'container not started by static audit' },
  canonicalAuthority: false,
  writesPerformed: false,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, ...report.summary, runtimeSmoke: report.runtimeSmoke.status, writesPerformed: false }, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
