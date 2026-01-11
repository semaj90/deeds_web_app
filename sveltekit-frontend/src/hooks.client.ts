/**
 * SvelteKit Client Hooks
 * Handles client-side initialization and global state
 */

import { dev } from '$app/environment';

/**
 * Initialize client-side features
 */
if (dev) {
  console.log('🚀 Legal AI Platform initialized');
}

/**
 * Global error handler
 */
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

/**
 * Global unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

/**
 * Performance monitoring
 */
if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 1000) {
          console.warn(`⚠️ Slow operation: ${entry.name} took ${entry.duration.toFixed(0)}ms`);
        }
      }
    });

    observer.observe({ entryTypes: ['measure', 'navigation'] });
  } catch (e) {
    // PerformanceObserver not supported
  }
}


