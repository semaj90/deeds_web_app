import { mkdir, writeFile } from 'node:fs/promises';
import { createHash }      from 'node:crypto';
import path                from 'node:path';
import { spawnSync }       from 'node:child_process';

const VALID_MODES = new Set(['diagnose', 'fast', 'plan', 'verify', 'full']);
const mode = VALID_MODES.has(process.argv[2] ?? '') ? process.argv[2] : 'diagnose';
const cwd = process.cwd();
const repoRoot = path.resolve(cwd, '..');
const appBase = process.env.PUBLIC_APP_URL ?? 'http://127.0.0.1:5173';
const agentUrl = process.env.AGENT_FIX_URL ?? `${appBase}/api/ai/agent`;
const preferredBackend = process.env.AGENT_FIX_PREFERRED_BACKEND === 'bifrost' ? 'bifrost' : 'turboquant';
const MAX_AGENT_QUERY_LENGTH = 3900;

// ── Redis + Langfuse config ───────────────────────────────────────────────────

const REDIS_URL            = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const FIXER_PATTERNS_KEY   = 'ace:fixer:patterns';   // hash: errorHash → JSON
const FIXER_TTL            = 60 * 60 * 24 * 7;        // 7 days

const LANGFUSE_BASE        = process.env.LANGFUSE_BASE_URL  ?? 'http://localhost:3030';
const LANGFUSE_SK          = process.env.LANGFUSE_SECRET_KEY ?? '';
const LANGFUSE_PK          = process.env.LANGFUSE_PUBLIC_KEY ?? '';

// ── helpers ───────────────────────────────────────────────────────────────────

function runNpmScript(scriptName) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'cmd.exe' : 'npm';
  const args = isWindows ? ['/d', '/s', '/c', `npm run ${scriptName}`] : ['run', scriptName];

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });

  return {
    scriptName,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function getDiagnosticsPlan(currentMode) {
  if (currentMode === 'fast') {
    return { profile: 'fast', primaryScript: 'check:ultra-fast', secondaryScript: 'check:svelte:fast' };
  }
  return { profile: 'full', primaryScript: 'check', secondaryScript: 'check:ts7' };
}

function truncate(text, maxLength = 6000) {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n...[truncated]`;
}

function clampAgentPrompt(text, maxLength = MAX_AGENT_QUERY_LENGTH) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 22)}\n...[prompt truncated]`;
}

function normalizeFilePath(match) {
  return match?.replace(/\\/g, '/');
}

function extractPrimaryFilePath(...texts) {
  const pattern = /(?:src|tests)\/[A-Za-z0-9_./-]+\.(?:svelte|ts|js|tsx|jsx)/g;
  for (const text of texts) {
    const normalized = text.replace(/\\/g, '/');
    const match = normalized.match(pattern)?.[0];
    if (match) return normalizeFilePath(match);
  }
  return undefined;
}

function extractErrorCode(text) {
  const m = text.match(/\bTS(\d{4})\b/);
  return m ? `TS${m[1]}` : null;
}

function buildModeInstruction(currentMode) {
  if (currentMode === 'fast') return 'Use the fast diagnostics slice first: identify the smallest likely owning file and the quickest falsifying next check before proposing a patch.';
  if (currentMode === 'plan') return 'Produce a minimal repair plan with file order, validation order, and the safest first change. Do not claim the fix is done.';
  if (currentMode === 'verify') return 'Focus on verification: decide whether the current diagnostics indicate the previous fix holds, what still fails, and the narrowest next validation step.';
  if (currentMode === 'full') return 'Act like a VS Code repair loop: diagnose root cause, inspect the owning files, propose the smallest safe repair, and describe the exact verification sequence. Use previous error-fix memory only as a hint.';
  return 'Diagnose the root cause from the current diagnostics, identify the owning files, and propose the smallest safe next patch. Use previous error-fix memory only as a hint.';
}

function buildPrompt(currentMode, primaryRun, secondaryRun, filePath, diagnosticsProfile, memoryHint) {
  const diagnosticExcerptLength = diagnosticsProfile === 'fast' ? 900 : 1400;
  const sections = [
    'You are diagnosing the current local TypeScript/Svelte diagnostics for this repository.',
    buildModeInstruction(currentMode),
    'Prefer the smallest relevant file slice. If you mention a patch, keep it local and reversible. If validation already looks clean, say what residual risk remains instead of inventing work.',
    filePath ? `Primary file hint: ${filePath}` : 'Primary file hint: unknown',
    `Diagnostics profile: ${diagnosticsProfile}`,
  ];

  if (memoryHint) {
    sections.push('', '**Prior fix memory (high-trust recall):**', memoryHint);
  }

  sections.push(
    '',
    `${primaryRun.scriptName} exit code: ${primaryRun.exitCode}`,
    '```text',
    truncate(`${primaryRun.stdout}\n${primaryRun.stderr}` || '[no output]', diagnosticExcerptLength),
    '```',
    '',
    `${secondaryRun.scriptName} exit code: ${secondaryRun.exitCode}`,
    '```text',
    truncate(`${secondaryRun.stdout}\n${secondaryRun.stderr}` || '[no output]', diagnosticExcerptLength),
    '```',
  );

  return clampAgentPrompt(sections.join('\n'));
}

function renderReport(currentMode, filePath, primaryRun, secondaryRun, result, prompt, diagnosticsProfile, langfuseTraceId, memoryHit) {
  return [
    `# Agentic Error Fix (${currentMode})`,
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Agent URL: ${agentUrl}`,
    `- Primary file: ${filePath ?? 'unknown'}`,
    `- Diagnostics profile: ${diagnosticsProfile}`,
    `- Requested backend: ${result.requestedBackend ?? preferredBackend}`,
    `- Inference backend: ${result.inferenceBackend ?? 'unknown'}`,
    `- Backend fallback: ${result.backendFallbackReason ?? 'none'}`,
    `- Cache tier: ${result.cacheTier ?? result.cacheTrace?.cacheTier ?? 'unknown'}`,
    `- Memory hint used: ${String(result.errorFixMemoryHit ?? memoryHit ?? false)}`,
    `- Verification status: ${result.verificationStatus ?? 'unknown'}`,
    langfuseTraceId ? `- Langfuse trace: ${LANGFUSE_BASE}/trace/${langfuseTraceId}` : '',
    '',
    '## Agent Answer',
    '',
    result.answer ?? '[no answer]',
    '',
    '## Agent Metadata',
    '',
    '```json',
    JSON.stringify(
      { rounds: result.rounds, toolsUsed: result.toolsUsed, durationMs: result.durationMs, cacheTrace: result.cacheTrace ?? null, sources: result.sources ?? [] },
      null, 2,
    ),
    '```',
    '',
    '## Diagnostics Input',
    '',
    `- npm run ${primaryRun.scriptName}: ${primaryRun.exitCode}`,
    `- npm run ${secondaryRun.scriptName}: ${secondaryRun.exitCode}`,
    '',
    '```text',
    truncate(`${primaryRun.stdout}\n${primaryRun.stderr}` || '[no output]'),
    '```',
    '',
    '```text',
    truncate(`${secondaryRun.stdout}\n${secondaryRun.stderr}` || '[no output]'),
    '```',
    '',
    '## Prompt Sent',
    '',
    '```text',
    prompt,
    '```',
  ].filter(l => l !== undefined).join('\n');
}

// ── Redis helpers (lightweight — no full fixer-memory module needed) ───────────

async function redisRecall(redis, errorHash) {
  try {
    const raw = await redis.hget(FIXER_PATTERNS_KEY, errorHash);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function redisStore(redis, errorHash, pattern) {
  try {
    await redis.hset(FIXER_PATTERNS_KEY, errorHash, JSON.stringify(pattern));
    await redis.expire(FIXER_PATTERNS_KEY, FIXER_TTL);
  } catch { /* non-fatal */ }
}

// ── Langfuse helpers ──────────────────────────────────────────────────────────

async function makeLangfuseClient() {
  if (!LANGFUSE_SK) return null;
  try {
    const { Langfuse } = await import('langfuse');
    return new Langfuse({ secretKey: LANGFUSE_SK, publicKey: LANGFUSE_PK, baseUrl: LANGFUSE_BASE });
  } catch { return null; }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const diagnosticsPlan = getDiagnosticsPlan(mode);
  const t0 = Date.now();

  const primaryRun   = runNpmScript(diagnosticsPlan.primaryScript);
  const secondaryRun = runNpmScript(diagnosticsPlan.secondaryScript);

  const filePath  = extractPrimaryFilePath(primaryRun.stdout, primaryRun.stderr, secondaryRun.stdout, secondaryRun.stderr);
  const errorCode = extractErrorCode(primaryRun.stdout + primaryRun.stderr + secondaryRun.stdout + secondaryRun.stderr);

  // Stable hash of diagnostic output → Redis key for pattern recall
  const diagText  = `${primaryRun.stdout}${primaryRun.stderr}${secondaryRun.stdout}${secondaryRun.stderr}`;
  const errorHash = createHash('sha256').update(`${mode}:${diagText.slice(0, 4096)}`).digest('hex').slice(0, 32);

  // ── Redis: check existing pattern ─────────────────────────────────────────
  let redis = null;
  let memoryHit = null;
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(REDIS_URL, {
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    const cached = await redisRecall(redis, errorHash);
    if (cached?.fixTemplate) {
      memoryHit = cached.fixTemplate;
      console.log(`✅ Redis pattern hit (hash=${errorHash.slice(0,8)}) trust=${cached.trustScore?.toFixed(2) ?? '?'}`);
    }
  } catch { /* Redis offline is fine */ }

  // ── Langfuse: open trace ───────────────────────────────────────────────────
  const lf = await makeLangfuseClient();
  const trace = lf?.trace({
    name: 'agentic-error-fix',
    metadata: { mode, diagnosticsProfile: diagnosticsPlan.profile, errorHash, errorCode, filePath, primaryExitCode: primaryRun.exitCode },
    tags: ['error-fix', mode, diagnosticsPlan.profile, errorCode ?? 'unknown'].filter(Boolean),
  });

  const prompt = buildPrompt(mode, primaryRun, secondaryRun, filePath, diagnosticsPlan.profile, memoryHit ?? null);

  // ── Agent call ─────────────────────────────────────────────────────────────
  const generation = trace?.generation({
    name: 'agent-call',
    model: 'gemma4-rotorquant:latest',
    input: { prompt: prompt.slice(0, 2000) },
    metadata: { agentUrl, preferredBackend, errorHash, memoryHitUsed: !!memoryHit },
  });

  const response = await fetch(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: prompt,
      pipeline: 'ace',
      bypassCache: mode === 'verify' || mode === 'fast',
      metadata: {
        source: 'vscode-task',
        mode,
        diagnosticsProfile: diagnosticsPlan.profile,
        preferredBackend,
        filePath,
        route: 'gemma4-agent',
        primaryScript: diagnosticsPlan.primaryScript,
        primaryExitCode: primaryRun.exitCode,
        secondaryScript: diagnosticsPlan.secondaryScript,
        secondaryExitCode: secondaryRun.exitCode,
        errorHash,
        langfuseTraceId: trace?.id ?? null,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    generation?.end({ output: { error: body.slice(0, 300) }, level: 'ERROR' });
    trace?.update({ metadata: { outcome: 'error' } });
    await lf?.shutdownAsync();
    if (redis) redis.disconnect();
    throw new Error(`Agent request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const result    = await response.json();
  const durationMs = Date.now() - t0;

  // ── Langfuse: close generation ─────────────────────────────────────────────
  generation?.end({
    output: { answer: result.answer?.slice(0, 500) ?? '[none]' },
    usage: { totalTokens: result.totalTokens ?? undefined },
    metadata: {
      rounds: result.rounds,
      cacheTier: result.cacheTier ?? result.cacheTrace?.cacheTier,
      inferenceBackend: result.inferenceBackend,
      durationMs,
    },
  });

  const isSuccess = primaryRun.exitCode === 0 || (result.answer && result.answer.length > 20);
  trace?.update({
    metadata: { outcome: isSuccess ? 'success' : 'failure', durationMs },
    output: result.answer?.slice(0, 300) ?? null,
  });

  // ── Redis: store pattern (on any valid answer) ─────────────────────────────
  if (redis && result.answer && result.answer.length > 20) {
    const existing = await redisRecall(redis, errorHash) ?? {};
    const successCount = (existing.successCount ?? 0) + (isSuccess ? 1 : 0);
    const failureCount = (existing.failureCount ?? 0) + (isSuccess ? 0 : 1);
    await redisStore(redis, errorHash, {
      errorHash,
      errorCode: errorCode ?? null,
      fixTemplate: result.answer.slice(0, 2000),
      fixKind: 'instruction',
      successCount,
      failureCount,
      trustScore: successCount / Math.max(successCount + failureCount, 1),
      tags: [mode, diagnosticsPlan.profile, errorCode ?? 'unknown'].filter(Boolean),
      langfuseTraceId: trace?.id ?? null,
      updatedAt: new Date().toISOString(),
    });
    console.log(`💾 Redis pattern stored (hash=${errorHash.slice(0,8)} trust=${(successCount / Math.max(successCount + failureCount, 1)).toFixed(2)})`);
  }

  await lf?.shutdownAsync();
  if (redis) redis.disconnect();

  // ── Write report ───────────────────────────────────────────────────────────
  const dateStamp  = new Date().toISOString().slice(0, 10);
  const timeStamp  = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
  const outputDir  = path.join(repoRoot, 'next_steps', 'active', dateStamp);
  const outputPath = path.join(outputDir, `agentic-error-fix-${timeStamp}-${mode}.md`);
  const report     = renderReport(mode, filePath, primaryRun, secondaryRun, result, prompt, diagnosticsPlan.profile, trace?.id ?? null, !!memoryHit);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, report, 'utf8');

  console.log(`Agentic error-fix report written to ${outputPath}`);
  console.log(`Requested backend: ${result.requestedBackend ?? preferredBackend}`);
  console.log(`Inference backend: ${result.inferenceBackend ?? 'unknown'}`);
  console.log(`Cache tier: ${result.cacheTier ?? result.cacheTrace?.cacheTier ?? 'unknown'}`);
  console.log(`Memory hint used: ${String(result.errorFixMemoryHit ?? !!memoryHit)}`);
  if (trace?.id) console.log(`Langfuse trace: ${LANGFUSE_BASE}/trace/${trace.id}`);
}

main().catch((error) => {
  console.error('[agentic-error-fix]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
