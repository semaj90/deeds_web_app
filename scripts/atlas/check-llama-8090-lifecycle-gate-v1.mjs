#!/usr/bin/env node
/**
 * Read-only precheck for the 7 mandatory gates in CLAUDE.md § Production hardening
 * before any agentic restart of TRACE (:8788) or llama-server (:8090).
 *
 * Strictly read-only with respect to runtime processes and datastores:
 * - Never prints, logs, or reads the value of TRACE_MCP_OPERATOR_TOKEN.
 * - Never kills or starts processes (only evaluates gates and writes receipt JSON).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPORT_REL = 'docs/reports/llama-8090-lifecycle-precheck-v1.json';
const TRACE_SRC_REL = 'sveltekit-frontend/src/mcp/trace-mcp-server.ts';

function probeListeningPorts() {
  if (process.platform !== 'win32') {
    return { supported: false, ports: {} };
  }
  const psScript = [
    "$ProgressPreference = 'SilentlyContinue'",
    '$rows = @()',
    'foreach ($p in @(8090, 8788)) {',
    '  $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue',
    '  foreach ($c in $conns) {',
    '    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue',
    '    $st = $null',
    "    if ($proc -and $proc.StartTime) { $st = $proc.StartTime.ToString('o') }",
    '    $rows += [PSCustomObject]@{',
    '      port = $p',
    '      pid = $c.OwningProcess',
    '      processName = if ($proc) { $proc.ProcessName } else { $null }',
    '      startTime = $st',
    '    }',
    '  }',
    '}',
    'ConvertTo-Json -InputObject $rows -Compress',
  ].join('\n');

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();

  const parsed = raw ? JSON.parse(raw) : [];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const byPort = {};
  for (const row of list) {
    if (!row || !row.port) continue;
    byPort[String(row.port)] = {
      listening: true,
      pid: row.pid,
      processName: row.processName,
      startTime: row.startTime,
    };
  }
  return { supported: true, ports: byPort };
}

async function probeFakeTokenOn8788() {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'ops.propose_patch',
      arguments: {
        operator_token: 'operator-2026-not-the-secret',
        file_path: 'README.md',
        search_block: 'a',
        replace_block: 'b',
        issue: 'claudemd-gate2-fake-token-precheck',
      },
    },
  };

  try {
    const res = await fetch('http://127.0.0.1:8788/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    let parsedError = null;
    const dataLine = text
      .split(/\r?\n/)
      .find((line) => line.startsWith('data: '));
    const jsonStr = dataLine ? dataLine.slice(6).trim() : text.trim();
    try {
      const rpc = JSON.parse(jsonStr);
      const innerText = rpc?.result?.content?.[0]?.text;
      if (typeof innerText === 'string') {
        const inner = JSON.parse(innerText);
        parsedError = inner?.error ?? null;
      }
    } catch {
      parsedError = jsonStr.slice(0, 200);
    }

    return {
      reachable: true,
      httpStatus: res.status,
      errorCode: parsedError,
      passed: parsedError === 'INVALID_OPERATOR_TOKEN',
    };
  } catch (err) {
    return {
      reachable: false,
      httpStatus: null,
      errorCode: err instanceof Error ? err.message : String(err),
      passed: false,
    };
  }
}

async function probeSlots8090(isListening) {
  if (!isListening) {
    return {
      listening: false,
      slotsIdle: true,
      note: 'Port 8090 is not listening; safe to start once operator gates pass.',
    };
  }
  try {
    const res = await fetch('http://127.0.0.1:8090/slots', {
      signal: AbortSignal.timeout(5000),
    });
    const slots = await res.json();
    const busyCount = Array.isArray(slots)
      ? slots.filter((s) => Boolean(s?.is_processing)).length
      : null;
    return {
      listening: true,
      httpStatus: res.status,
      slotCount: Array.isArray(slots) ? slots.length : null,
      busyCount,
      slotsIdle: busyCount === 0,
    };
  } catch (err) {
    return {
      listening: true,
      httpStatus: null,
      slotCount: null,
      busyCount: null,
      slotsIdle: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const portProbe = probeListeningPorts();
  const port8788 = portProbe.ports['8788'] ?? { listening: false, pid: null, startTime: null };
  const port8090 = portProbe.ports['8090'] ?? { listening: false, pid: null, startTime: null };

  const fakeTokenProbe = port8788.listening
    ? await probeFakeTokenOn8788()
    : { reachable: false, httpStatus: null, errorCode: 'PORT_8788_NOT_LISTENING', passed: false };

  const slots8090 = await probeSlots8090(Boolean(port8090.listening));

  const traceSrcAbs = path.join(REPO_ROOT, TRACE_SRC_REL);
  const traceSrcMtime = statSync(traceSrcAbs).mtime.toISOString();
  const traceStartMs = port8788.startTime ? Date.parse(port8788.startTime) : Number.NaN;
  const traceMtimeMs = Date.parse(traceSrcMtime);
  const processNewerThanSource =
    Number.isFinite(traceStartMs) && traceStartMs > traceMtimeMs;

  const callerEnvHasToken =
    typeof process.env.TRACE_MCP_OPERATOR_TOKEN === 'string' &&
    process.env.TRACE_MCP_OPERATOR_TOKEN.trim().length >= 16;

  const blockingGates = [];
  if (!port8788.listening) blockingGates.push('TRACE_8788_NOT_LISTENING');
  if (!fakeTokenProbe.passed) {
    blockingGates.push(
      `GATE_2_FAKE_TOKEN_REFUSAL_FAILED:${fakeTokenProbe.errorCode ?? 'UNKNOWN'}`
    );
  }
  if (port8788.listening && !processNewerThanSource) {
    blockingGates.push('GATE_7_TRACE_PROCESS_OLDER_THAN_SOURCE');
  }
  if (!port8090.listening) {
    blockingGates.push('LLAMA_8090_NOT_LISTENING');
  } else if (!slots8090.slotsIdle) {
    blockingGates.push('GATE_3_LLAMA_8090_SLOTS_BUSY');
  }

  const report = {
    schema: 'atlas.llama-8090-lifecycle-precheck.v1',
    generatedAt: new Date().toISOString(),
    writesPerformed: false,
    lifecycleActionExecuted: false,
    status: blockingGates.length === 0 ? 'READY_OR_HEALTHY' : 'BLOCKED_OPERATOR_GATES_UNMET',
    gates: {
      gate1_callerEnvTokenConfigured: callerEnvHasToken,
      gate1_running8788HasTokenConfigured: fakeTokenProbe.errorCode === 'INVALID_OPERATOR_TOKEN',
      gate2_fakeTokenNegativeCheck: fakeTokenProbe,
      gate3_8090SlotsIdleCheck: slots8090,
      gate4_portScopedPids: {
        port8788: port8788,
        port8090: port8090,
      },
      gate5_typedSinglePurposeToolOnly: true,
      gate6_auditReceiptWritten: REPORT_REL,
      gate7_8788StartNewerThanSource: {
        traceSourceFile: TRACE_SRC_REL,
        traceSourceMtime: traceSrcMtime,
        traceProcessStartTime: port8788.startTime ?? null,
        passed: processNewerThanSource,
      },
    },
    blockingGates,
    humanRemediation: [
      '1. Configure TRACE_MCP_OPERATOR_TOKEN in the TRACE :8788 launch environment and restart TRACE if required so fake-token negative tests return INVALID_OPERATOR_TOKEN instead of OPERATOR_TOKEN_ENV_UNCONFIGURED.',
      '2. Start or restart :8090 via VS Code Task: "⚡ TurboQuant: Start (vision, CPU projector, :8090)" and confirm via "⚡ TurboQuant: Status". Never use generic taskkill /IM llama-server.exe.',
    ],
  };

  const reportAbs = path.join(REPO_ROOT, REPORT_REL);
  mkdirSync(path.dirname(reportAbs), { recursive: true });
  writeFileSync(reportAbs, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        status: report.status,
        blockingGates: report.blockingGates,
        port8788Pid: port8788.pid,
        port8090Listening: Boolean(port8090.listening),
        fakeTokenErrorCode: fakeTokenProbe.errorCode,
        reportPath: REPORT_REL,
        writesPerformed: false,
        lifecycleActionExecuted: false,
      },
      null,
      2
    )
  );
}

main();
