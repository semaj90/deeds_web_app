import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const VALID_MODES = new Set(['diagnose', 'fast', 'plan', 'verify', 'full']);
const mode = VALID_MODES.has(process.argv[2] ?? '') ? process.argv[2] : 'diagnose';
const cwd = process.cwd();
const repoRoot = path.resolve(cwd, '..');
const agentUrl = process.env.AGENT_FIX_URL ?? 'http://127.0.0.1:5173/api/ai/agent';
const preferredBackend = process.env.AGENT_FIX_PREFERRED_BACKEND === 'bifrost' ? 'bifrost' : 'turboquant';
const MAX_AGENT_QUERY_LENGTH = 3900;

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
    return {
      profile: 'fast',
      primaryScript: 'check:ultra-fast',
      secondaryScript: 'check:svelte:fast',
    };
  }

  return {
    profile: 'full',
    primaryScript: 'check',
    secondaryScript: 'check:ts7',
  };
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

function buildModeInstruction(currentMode) {
  if (currentMode === 'fast') {
    return 'Use the fast diagnostics slice first: identify the smallest likely owning file and the quickest falsifying next check before proposing a patch.';
  }

  if (currentMode === 'plan') {
    return 'Produce a minimal repair plan with file order, validation order, and the safest first change. Do not claim the fix is done.';
  }

  if (currentMode === 'verify') {
    return 'Focus on verification: decide whether the current diagnostics indicate the previous fix holds, what still fails, and the narrowest next validation step.';
  }

  if (currentMode === 'full') {
    return 'Act like a VS Code repair loop: diagnose root cause, inspect the owning files, propose the smallest safe repair, and describe the exact verification sequence. Use previous error-fix memory only as a hint.';
  }

  return 'Diagnose the root cause from the current diagnostics, identify the owning files, and propose the smallest safe next patch. Use previous error-fix memory only as a hint.';
}

function buildPrompt(currentMode, primaryRun, secondaryRun, filePath, diagnosticsProfile) {
  const diagnosticExcerptLength = diagnosticsProfile === 'fast' ? 900 : 1400;
  const sections = [
    'You are diagnosing the current local TypeScript/Svelte diagnostics for this repository.',
    buildModeInstruction(currentMode),
    'Prefer the smallest relevant file slice. If you mention a patch, keep it local and reversible. If validation already looks clean, say what residual risk remains instead of inventing work.',
    filePath ? `Primary file hint: ${filePath}` : 'Primary file hint: unknown',
    `Diagnostics profile: ${diagnosticsProfile}`,
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
  ];

  return clampAgentPrompt(sections.join('\n'));
}

function renderReport(currentMode, filePath, primaryRun, secondaryRun, result, prompt, diagnosticsProfile) {
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
    `- Memory hint used: ${String(result.errorFixMemoryHit ?? false)}`,
    `- Verification status: ${result.verificationStatus ?? 'unknown'}`,
    '',
    '## Agent Answer',
    '',
    result.answer ?? '[no answer]',
    '',
    '## Agent Metadata',
    '',
    '```json',
    JSON.stringify(
      {
        rounds: result.rounds,
        toolsUsed: result.toolsUsed,
        durationMs: result.durationMs,
        cacheTrace: result.cacheTrace ?? null,
        sources: result.sources ?? [],
      },
      null,
      2,
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
  ].join('\n');
}

async function main() {
  const diagnosticsPlan = getDiagnosticsPlan(mode);
  const primaryRun = runNpmScript(diagnosticsPlan.primaryScript);
  const secondaryRun = runNpmScript(diagnosticsPlan.secondaryScript);
  const filePath = extractPrimaryFilePath(
    primaryRun.stdout,
    primaryRun.stderr,
    secondaryRun.stdout,
    secondaryRun.stderr,
  );
  const prompt = buildPrompt(mode, primaryRun, secondaryRun, filePath, diagnosticsPlan.profile);

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
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const result = await response.json();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const timeStamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
  const outputDir = path.join(repoRoot, 'next_steps', 'active', dateStamp);
  const outputPath = path.join(outputDir, `agentic-error-fix-${timeStamp}-${mode}.md`);
  const report = renderReport(mode, filePath, primaryRun, secondaryRun, result, prompt, diagnosticsPlan.profile);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, report, 'utf8');

  console.log(`Agentic error-fix report written to ${outputPath}`);
  console.log(`Requested backend: ${result.requestedBackend ?? preferredBackend}`);
  console.log(`Inference backend: ${result.inferenceBackend ?? 'unknown'}`);
  console.log(`Cache tier: ${result.cacheTier ?? result.cacheTrace?.cacheTier ?? 'unknown'}`);
  console.log(`Memory hint used: ${String(result.errorFixMemoryHit ?? false)}`);
}

main().catch((error) => {
  console.error('[agentic-error-fix]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});