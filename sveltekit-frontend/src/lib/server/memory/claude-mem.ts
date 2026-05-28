// @ts-nocheck
// claude-mem-opencode subpath imports are not in the package exports map.
// Use a runtime-only dynamic import so Vite does not attempt to bundle or
// resolve these paths at build time. The module is only available in the
// Node SSR runtime where node_modules is on disk.

let integration: any = null;

async function loadIntegration() {
  // Bypass static analysis: build the specifier at runtime
  const specifier = ['claude-mem-opencode', 'dist', 'integration', 'index.js'].join('/');
  return import(/* @vite-ignore */ specifier);
}

export async function initClaudeMem(workerUrl?: string) {
  if (integration) return integration;
  try {
    const mod = await loadIntegration();
    const instance = new mod.ClaudeMemIntegration(workerUrl);
    await instance.initialize();
    integration = instance;
    return integration;
  } catch (err) {
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

export async function getStatus() {
  if (!integration) return { initialized: false, workerReady: false, workerUrl: null, currentProject: null };
  return integration.getStatus();
}

export function isMemoryAvailable() {
  return Boolean(integration && integration.isMemoryAvailable && integration.isMemoryAvailable());
}

export async function searchMemory(query: string, options?: Record<string, unknown>) {
  if (!integration) throw new Error('ClaudeMemIntegration not initialized');
  return integration.searchMemory(query, options);
}

export function getWorkerClient() {
  if (!integration) throw new Error('ClaudeMemIntegration not initialized');
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
