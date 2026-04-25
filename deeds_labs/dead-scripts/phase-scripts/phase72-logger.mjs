import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const LOG_DIR = resolve(__dirname, '../logs/phase72');
const getLogFile = () => resolve(LOG_DIR, `phase72-${new Date().toISOString().slice(0, 10)}.jsonl`);

let dirEnsured = false;

async function ensureDir() {
  if (dirEnsured) return;
  try {
    await mkdir(LOG_DIR, { recursive: true });
    dirEnsured = true;
  } catch (err) {
    // Directory might already exist
    if (err.code !== 'EEXIST') {
      console.error('[phase72-logger] Failed to create log directory:', err);
    }
    dirEnsured = true;
  }
}

/**
 * Log a structured event to JSONL file
 * @param {Object} event - Event data to log
 */
export async function logEvent(event) {
  await ensureDir();
  const entry = {
    ts: new Date().toISOString(),
    ...event
  };
  try {
    await appendFile(getLogFile(), JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error('[phase72-logger] Failed to write log:', err);
  }
}

/**
 * Log a standard event with kind and message
 * @param {string} kind - Event type (e.g., 'info', 'error', 'llm_call')
 * @param {string} message - Event message
 * @param {Object} extra - Additional data
 */
export function logStd(kind, message, extra = {}) {
  return logEvent({ kind, message, ...extra });
}

/**
 * Log Phase 72 step execution
 */
export function logPhaseStep(phase, step, metrics = {}) {
  return logEvent({
    kind: 'phase_step',
    phase,
    step,
    sessionId: process.env.PHASE72_SESSION_ID ?? 'local',
    metrics
  });
}

/**
 * Log LLM/AI model call
 */
export function logLlmCall(model, inputChars, outputChars, latencyMs, toolsUsed = [], result = null) {
  return logEvent({
    kind: 'llm_call',
    phase: 'phase72',
    sessionId: process.env.PHASE72_SESSION_ID ?? 'local',
    model,
    input_chars: inputChars,
    output_chars: outputChars,
    latency_ms: latencyMs,
    tools_used: toolsUsed,
    result
  });
}

/**
 * Get console logger with Vite-style timestamps
 */
export const log = {
  info: (msg, data = {}) => {
    console.log(`\x1b[36m[phase72]\x1b[0m ${new Date().toISOString()} ${msg}`);
    logStd('info', msg, data);
  },
  success: (msg, data = {}) => {
    console.log(`\x1b[32m[phase72]\x1b[0m ${new Date().toISOString()} ✓ ${msg}`);
    logStd('success', msg, data);
  },
  error: (msg, data = {}) => {
    console.error(`\x1b[31m[phase72]\x1b[0m ${new Date().toISOString()} ✗ ${msg}`);
    logStd('error', msg, data);
  },
  warn: (msg, data = {}) => {
    console.warn(`\x1b[33m[phase72]\x1b[0m ${new Date().toISOString()} ⚠ ${msg}`);
    logStd('warn', msg, data);
  },
  progress: (msg, data = {}) => {
    console.log(`\x1b[35m[phase72]\x1b[0m ${new Date().toISOString()} → ${msg}`);
    logStd('progress', msg, data);
  }
};
