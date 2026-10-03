/** Read-only readiness probe for the Miniforge NLP sidecar. */
export async function isMiniforgeNlpRunning(port = 8095) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return body?.status === 'ok' && body?.model === 'miniforge-nlp-sidecar';
  } catch {
    return false;
  }
}
