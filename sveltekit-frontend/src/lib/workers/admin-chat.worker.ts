/**
 * Web Worker for heavy client-side compute in Admin Chat.
 * Handles token estimation and text processing to keep the UI thread smooth.
 */

self.onmessage = (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'ESTIMATE_TOKENS':
      const text = payload as string;
      // Simple heuristic: 4 chars per token for English
      const estimate = Math.ceil(text.length / 4);
      self.postMessage({ type: 'TOKEN_ESTIMATE', payload: estimate });
      break;

    case 'FORMAT_JSON':
      try {
        const formatted = JSON.stringify(JSON.parse(payload), null, 2);
        self.postMessage({ type: 'JSON_FORMATTED', payload: formatted });
      } catch {
        self.postMessage({ type: 'JSON_ERROR', payload: 'Invalid JSON' });
      }
      break;

    default:
      console.warn('[AdminWorker] Unknown message type:', type);
  }
};
