/**
 * UI Reconnaissance Utility
 * Captures a lightweight snapshot of the current view for AI consumption.
 */

export interface UISnapshot {
  pathname: string;
  elements: Record<string, {
    type: string;
    text: string;
    id: string;
    visible: boolean;
  }>;
  timestamp: string;
}

export function captureUISnapshot(): UISnapshot {
  if (typeof document === 'undefined') return { pathname: '', elements: {}, timestamp: '' };

  const snapshot: UISnapshot = {
    pathname: window.location.pathname,
    elements: {},
    timestamp: new Date().toISOString()
  };

  // Capture all data-testid or data-mcp-id elements
  const trackable = document.querySelectorAll('[data-mcp-id], [id], button, h1, h2');
  
  trackable.forEach((el) => {
    const id = el.getAttribute('data-mcp-id') || el.id || `el-${Math.random().toString(36).slice(2, 6)}`;
    const rect = el.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;

    if (isVisible) {
      snapshot.elements[id] = {
        type: el.tagName.toLowerCase(),
        text: el.textContent?.slice(0, 50).trim() || '',
        id: id,
        visible: isVisible
      };
    }
  });

  return snapshot;
}
