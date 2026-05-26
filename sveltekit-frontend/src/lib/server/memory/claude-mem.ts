// Lightweight server-side wrapper for claude-mem-opencode
// Provides a singleton instance and safe helpers to initialize/use the worker
import type {
  ClaudeMemIntegration as ClaudeMemIntegrationType,
  WorkerClient as WorkerClientType,
} from 'claude-mem-opencode';

let integration: ClaudeMemIntegrationType | null = null;

export async function initClaudeMem(workerUrl?: string) {
  if (integration) return integration;
  try {
    const mod = await import('claude-mem-opencode');
    // prefer provided workerUrl, otherwise library default
    const instance: ClaudeMemIntegrationType = new mod.ClaudeMemIntegration(workerUrl);
    await instance.initialize();
    integration = instance;
    return integration;
  } catch (err) {
    // do not throw hard — caller can detect by getStatus/isAvailable
    console.warn('claude-mem integration failed to initialize:', err);
    integration = null;
    throw err;
  }
}

export function getClaudeMem() {
  if (!integration) throw new Error('ClaudeMemIntegration not initialized. Call initClaudeMem() first.');
  return integration;
}

export async function shutdownClaudeMem() {
  if (!integration) return;
  try {
    await integration.shutdown();
  } catch (err) {
    console.warn('Error shutting down ClaudeMemIntegration:', err);
  }
  integration = null;
}

// Convenience wrappers
export async function getStatus() {
  if (!integration) return { initialized: false, workerReady: false, workerUrl: null, currentProject: null };
  return integration.getStatus();
}

export function isMemoryAvailable() {
  return Boolean(integration && integration.isMemoryAvailable && integration.isMemoryAvailable());
}

export async function searchMemory(query: string, options?: Record<string, unknown>) {
  if (!integration) throw new Error('ClaudeMemIntegration not initialized');
  return integration.searchMemory(query, options as any);
}

export function getWorkerClient(): WorkerClientType {
  if (!integration) throw new Error('ClaudeMemIntegration not initialized');
  // @ts-ignore - library exposes getWorkerClient
  return (integration as any).getWorkerClient();
}

export default {
  initClaudeMem,
  getClaudeMem,
  shutdownClaudeMem,
  getStatus,
  isMemoryAvailable,
  searchMemory,
  getWorkerClient,
};
