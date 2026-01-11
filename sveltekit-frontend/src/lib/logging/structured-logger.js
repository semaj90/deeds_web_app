// Minimal structured logger stub to satisfy imports and provide basic console logging.
class StructuredLogger {
 async logAPIRequest(entry) {
 console.debug('[api:req]', entry.requestId, entry.method, entry.endpoint);
 }
 async logAPIResponse(entry) {
 if (entry.success) {
 console.debug('[api:res]', entry.requestId, entry.statusCode, entry.processingTime + 'ms');
 } else {
 console.warn('[api: res, err]', entry.requestId, entry.statusCode, entry.error);
 }
 }
 async logError(entry) {
 console.error('[error]', entry.context || 'general', entry.error, entry.requestId || '');
 }
 async logEvent(entry) {
 console.info('[event]', entry.type || 'generic', entry.message || '');
 }
 async logDocumentProcessing(entry) {
 console.debug('[doc:process]', entry.documentId || 'unknown', entry.operation || 'unknown');
 }
 async logSearch(entry) {
 console.debug('[search]', entry.query || 'unknown', entry.resultsCount || 0);
 }
}
export const logger = {
 // ...existing methods like logError, logPerformance, logAPIRequest, logAPIResponse, etc. ...
 /**
 * Log a user action in a structured way.
 * Kept compatible/safe so components can call logger.logUserAction(...)
 */
 async logUserAction(payload) {
 try {
 const entry = {
 type: 'user_action',
 timestamp: Date.now(),
 ...payload,
 };
 // Prefer existing event/info logger helpers if present
 if (typeof this.logEvent === 'function') {
 return await this.logEvent(entry);
 }
 if (typeof this.logInfo === 'function') {
 return await this.logInfo(entry);
 }
 // Fallback: attempt to POST to a /api/logs endpoint if available (non-blocking)
 if (typeof fetch === 'function') {
 try {
 await fetch('/api/logs', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(entry),
 });
 } catch (e) {
 // ignore network errors for logging fallback
 }
 } else {
 // Last fallback: console.debug
 console.debug('[logger] user action', entry);
 }
 return Promise.resolve(true);
 } catch (err) {
 // Ensure logging failures don't surface to callers
 console.debug('[logger] logUserAction failure', err);
 return Promise.resolve(false);
 }
 }, // ...existing methods...
};

