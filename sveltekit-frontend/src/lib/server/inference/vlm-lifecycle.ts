/**
 * VLM Lifecycle Manager
 * 
 * Manages the transitions between Text-only and Vision modes to prevent VRAM OOM.
 * Uses Redis to synchronize state across multiple server processes and ensures
 * only one transition happens at a time via a distributed lock.
 */

import { getRedis } from '$lib/server/redis.js';
import { execSync, spawn } from 'node:child_process';
import { ENV } from '$lib/server/env.server.js';
import { TURBOQUANT_BASE_URL } from '$lib/ai/model-ids.js';

export enum VlmMode {
  OFF = 'OFF',
  TEXT = 'TEXT',
  VISION = 'VISION',
  SWITCHING = 'SWITCHING'
}

const REDIS_STATE_KEY = 'vlm:lifecycle:state';
const REDIS_LOCK_KEY = 'vlm:lifecycle:lock';
const LOCK_TTL_MS = 30000;
const RESTART_DELAY_MS = 3000;

// Environment fallbacks for TurboQuant
const TURBOQUANT_EXE =
  process.env.TURBOQUANT_EXE_PATH ??
  process.env.LLAMA_SERVER_PATH ??
  'llama-server.exe';

const TURBOQUANT_GGUF =
  process.env.TURBOQUANT_MODEL_PATH ??
  process.env.ROTORQUANT_MODEL_PATH ??
  process.env.TURBO_MODEL_PATH ??
  '';

const TURBOQUANT_MMPROJ =
  process.env.TURBOQUANT_MMPROJ_PATH ??
  process.env.MMPROJ_PATH ??
  '';

/**
 * Get the current VLM lifecycle state from Redis
 */
export async function getVlmState(): Promise<VlmMode> {
  try {
    const redis = getRedis();
    const state = await redis.get(REDIS_STATE_KEY);
    return (state as VlmMode) || VlmMode.OFF;
  } catch (err) {
    console.error('[vlm-lifecycle] Failed to get state from Redis:', err);
    return VlmMode.OFF;
  }
}

/**
 * Acquire a distributed lock to perform mode switching
 */
async function acquireLock(requestId: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(REDIS_LOCK_KEY, requestId, 'PX', LOCK_TTL_MS, 'NX');
  return result === 'OK';
}

/**
 * Release the distributed lock
 */
async function releaseLock(requestId: string): Promise<void> {
  const redis = getRedis();
  const currentId = await redis.get(REDIS_LOCK_KEY);
  if (currentId === requestId) {
    await redis.del(REDIS_LOCK_KEY);
  }
}

/**
 * Switch the VLM mode safely
 */
export async function switchVlmMode(targetMode: VlmMode): Promise<{ success: boolean; error?: string }> {
  const currentMode = await getVlmState();
  if (currentMode === targetMode) return { success: true };
  if (currentMode === VlmMode.SWITCHING) return { success: false, error: 'Already switching mode' };

  const requestId = Math.random().toString(36).substring(7);
  const locked = await acquireLock(requestId);
  if (!locked) return { success: false, error: 'Failed to acquire lifecycle lock' };

  try {
    const redis = getRedis();
    await redis.set(REDIS_STATE_KEY, VlmMode.SWITCHING);

    console.info(`[vlm-lifecycle] Switching mode: ${currentMode} -> ${targetMode}`);

    if (targetMode === VlmMode.VISION) {
      // Transitioning to Vision (usually means stopping TurboQuant to free VRAM for Ollama VLM)
      const tqProcess = findTurboQuantProcess();
      if (tqProcess) {
        stopTurboQuant(tqProcess.pid);
        // Wait for VRAM to settle
        await new Promise(r => setTimeout(r, RESTART_DELAY_MS));
      }
    } else if (targetMode === VlmMode.TEXT) {
      // Transitioning back to Text (Restart TurboQuant)
      // First try to unload Ollama VLM model if it was running
      await unloadOllamaModel('gemma4:e4b-it-q4_K_M');
      
      const modelPath = TURBOQUANT_GGUF;
      const mmprojPath = TURBOQUANT_MMPROJ;
      
      if (modelPath) {
        restartTurboQuant(modelPath, mmprojPath);
        // Wait for server to start
        await new Promise(r => setTimeout(r, RESTART_DELAY_MS));
      }
    }

    await redis.set(REDIS_STATE_KEY, targetMode);
    return { success: true };
  } catch (err) {
    console.error('[vlm-lifecycle] Mode switch failed:', err);
    const redis = getRedis();
    await redis.set(REDIS_STATE_KEY, currentMode); // Revert on failure
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await releaseLock(requestId);
  }
}

/**
 * Find the PID of llama-server listening on :8090
 */
function findTurboQuantProcess(): { pid: number } | null {
  try {
    // Find PID on port 8090 via netstat (Windows specific)
    const netstat = execSync('netstat -ano | findstr ":8090" | findstr "LISTENING"', {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    const pidMatch = netstat.match(/(\d+)\s*$/m);
    if (!pidMatch) return null;
    const pid = parseInt(pidMatch[1]);
    if (!pid || pid <= 4) return null;
    return { pid };
  } catch {
    return null;
  }
}

/**
 * Stop TurboQuant llama-server by PID
 */
function stopTurboQuant(pid: number): boolean {
  try {
    execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
    console.info(`[vlm-lifecycle] Stopped llama-server PID ${pid}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restart TurboQuant llama-server in background
 */
function restartTurboQuant(modelPath: string, mmprojPath?: string): void {
  try {
    const ctx = process.env.TURBO_CTX ?? '16384';
    const ngl = process.env.TURBO_NGL ?? '99';
    const args = [
      '-m', modelPath,
      '--port', '8090',
      '-ngl', ngl,
      '--flash-attn', 'on',
      '-ctk', 'q8_0',
      '-ctv', 'q8_0',
      '-c', ctx,
    ];
    if (mmprojPath) {
      args.push('--mmproj', mmprojPath);
    }
    const child = spawn(TURBOQUANT_EXE, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    console.info(`[vlm-lifecycle] Restarted llama-server → PID ${child.pid}`);
  } catch (err) {
    console.error('[vlm-lifecycle] Failed to restart llama-server:', err);
  }
}

/**
 * Unload a model from Ollama to free VRAM
 */
async function unloadOllamaModel(model: string): Promise<void> {
  try {
    await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0 }),
      signal: AbortSignal.timeout(5000),
    });
    console.info(`[vlm-lifecycle] Unloaded Ollama model: ${model}`);
  } catch {
    // Ignore errors during unload
  }
}
