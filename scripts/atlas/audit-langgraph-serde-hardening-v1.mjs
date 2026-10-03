#!/usr/bin/env node
/**
 * Read-only LangGraph serialization/checkpoint hardening audit.
 *
 * This audit inspects source, dependency pins, and compose configuration. It
 * does not install packages, start containers, create schemas, or connect to
 * PostgreSQL/Redis/Qdrant.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const reportPath = path.resolve(
  process.argv[3] ?? 'docs/reports/langgraph-serde-hardening-v1.json',
);

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const requirements = read('docker/langgraph-synthesis/requirements.txt');
const app = read('docker/langgraph-synthesis/app.py');
const compose = read('docker-compose.yml');
const dockerfile = read('docker/langgraph-synthesis/Dockerfile');

const checks = [];
const check = (id, passed, detail) => checks.push({
  id,
  status: passed ? 'PASS' : 'FAIL',
  detail,
});

const pinned = (name, source) => {
  const match = source.match(new RegExp(`^${name}==([^\\r\\n]+)$`, 'm'));
  return match?.[1] ?? null;
};

const atLeast = (actual, minimum) => {
  const parse = (value) => String(value).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(actual);
  const b = parse(minimum);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
  }
  return true;
};

const langgraph = pinned('langgraph', requirements);
const langchain = pinned('langchain', requirements);
const checkpoint = pinned('langgraph-checkpoint', requirements);
const checkpointPostgres = pinned('langgraph-checkpoint-postgres', requirements);

check(
  'LANGGRAPH_VERSION_FLOOR',
  Boolean(langgraph) && atLeast(langgraph, '1.0.10'),
  `langgraph=${langgraph ?? 'MISSING'}; minimum security floor=1.0.10`,
);
check(
  'LANGCHAIN_GRAPH_COMPATIBILITY',
  langchain === '1.2.11' && Boolean(langgraph) && atLeast(langgraph, '1.1.0') && !atLeast(langgraph, '1.3.0'),
  `langchain=${langchain ?? 'MISSING'} requires a compatible langgraph 1.1.x–1.2.x range; langgraph=${langgraph ?? 'MISSING'}`,
);
check(
  'CHECKPOINT_VERSION_FLOOR',
  Boolean(checkpoint) && atLeast(checkpoint, '4.1.1'),
  `langgraph-checkpoint=${checkpoint ?? 'MISSING'}; minimum security floor=4.1.1`,
);
check(
  'CHECKPOINT_POSTGRES_PINNED',
  Boolean(checkpointPostgres),
  `langgraph-checkpoint-postgres=${checkpointPostgres ?? 'MISSING'}`,
);
check(
  'STRICT_MSGPACK_DEFAULT',
  /LANGGRAPH_STRICT_MSGPACK\s*=\s*os\.environ\.get\(\s*["']LANGGRAPH_STRICT_MSGPACK["']\s*,\s*["']true["']\s*\)/.test(app),
  'strict msgpack is enabled by default in the service source',
);
check(
  'STRICT_MSGPACK_COMPOSED',
  /LANGGRAPH_STRICT_MSGPACK=\$\{LANGGRAPH_STRICT_MSGPACK:-true\}/.test(compose),
  'compose preserves strict msgpack unless an operator explicitly overrides it',
);
check(
  'CHECKPOINT_NAMESPACE_ISOLATED',
  /LANGGRAPH_CHECKPOINT_SCHEMA\s*=\s*os\.environ\.get\(\s*["']LANGGRAPH_CHECKPOINT_SCHEMA["']\s*,\s*["']langgraph_py["']\s*\)/.test(app) &&
    /LANGGRAPH_CHECKPOINT_SCHEMA=\$\{LANGGRAPH_CHECKPOINT_SCHEMA:-langgraph_py\}/.test(compose),
  'Python checkpoint state defaults to the separate langgraph_py namespace',
);
check(
  'CHECKPOINT_SETUP_OPT_IN',
  /if LANGGRAPH_CHECKPOINT_SETUP:\s*\n\s+await checkpointer\.setup\(\)/.test(app) &&
    /LANGGRAPH_CHECKPOINT_SETUP=\$\{LANGGRAPH_CHECKPOINT_SETUP:-false\}/.test(compose),
  'checkpoint schema setup remains an explicit operator-controlled action',
);
check(
  'THREAD_ID_REQUIRED',
  /LANGGRAPH_CHECKPOINT_ENABLED and not req\.thread_id/.test(app),
  'enabled checkpointing requires thread_id for workflow identity',
);
check(
  'NO_PICKLE_FALLBACK_OPT_IN',
  !/pickle_fallback\s*=\s*True|allowed_(?:json|msgpack)_modules\s*=\s*True/.test(app),
  'service source does not enable permissive pickle or module allowlists',
);
check(
  'CPU_ORCHESTRATOR_IMAGE',
  !/^FROM[^\n]*(?:nvidia|cuda)/im.test(dockerfile) &&
    !/^RUN[^\n]*(?:nvidia|cuda|torch|cuvs|cutile)/im.test(dockerfile),
  'LangGraph remains a CPU orchestration image; GPU executors stay in sidecars',
);

const passed = checks.filter((item) => item.status === 'PASS').length;
const failed = checks.length - passed;
const inputChecksum = `sha256:${crypto.createHash('sha256')
  .update(requirements)
  .update(app)
  .update(compose)
  .update(dockerfile)
  .digest('hex')}`;

const report = {
  schema: 'atlas.langgraph-serde-hardening-audit.v1',
  generatedAt: new Date().toISOString(),
  inputChecksum,
  packagePins: { langchain, langgraph, checkpoint, checkpointPostgres },
  checks,
  summary: {
    total: checks.length,
    passed,
    failed,
    status: failed === 0 ? 'STATIC_HARDENING_PROVEN' : 'STATIC_HARDENING_REVIEW_REQUIRED',
  },
  runtimeSmoke: {
    status: 'NOT_RUN',
    reason: 'Static audit does not install packages or start the container.',
  },
  checkpoint: {
    namespace: 'langgraph_py',
    setup: 'explicit opt-in',
    threadIdRequiredWhenEnabled: true,
    canonicalAuthority: false,
  },
  canonicalAuthority: false,
  writesPerformed: false,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, ...report.summary, runtimeSmoke: report.runtimeSmoke.status, writesPerformed: false }, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
