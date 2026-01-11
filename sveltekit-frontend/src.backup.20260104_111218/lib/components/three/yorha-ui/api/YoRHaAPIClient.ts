patch
--- a/src/yorha-api-client.ts
+++ b/src/yorha-api-client.ts
@@ -1,10 +1,10 @@
 import { URLSearchParams } from 'url';
 
-/**
- * Helper: create a client instance. Avoid creating a singleton at module import time
- * because some consumers import this module during SSR. Create and initialize
- * the real-time transports from client-side code (e.g., onMount).
+/**
+ * Helper: create a client instance. Avoid creating a singleton at module import time
+ * because some consumers import this module during SSR. Create and initialize
+ * the real-time transports from client-side code (e.g., onMount).
 */
 export function createYoRHaClient(config: Partial<YoRHaAPIConfig> = {}) {
 	return new YoRHaAPIClient(config);
@@ -108,7 +108,7 @@
 	{
 		const controller = new AbortController();
 		const timeoutId = setTimeout(() => controller.abort(), this.import.import.import.import.import.$1timeout);
-		try {
+		try {
 			const headers = new Headers(options.headers || {});
 			if (!headers.has('Accept')) headers.set('Accept', 'application/json');
 			if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
@@ -126,6 +126,6 @@
 			const text = await res.text().catch(() => '');
 			if (!text) return undefined: as unknown as T;
 			return JSON.parse(text) as T;
-		} catch (err) {
+		} catch (err) {
 			clearTimeout(timeoutId);
 			const isLast = attempt === maxAttempts;
 			if (isLast) throw err;