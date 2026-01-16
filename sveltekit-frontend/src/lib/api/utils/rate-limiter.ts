// src/lib/api/utils/rate-limiter.ts
export interface RateLimitOptions<Args extends unknown[] = unknown[]> {
 /**
 * Key resolver to partition rate buckets (e.g. per-endpoint or per-user).
 * Default: single global bucket.
 */
 key?: (...args: Args) => string;
 /**
 * Maximum number of tokens (requests) allowed per window.
 * Default: 50
 */
 maxRequests?: number;
 /**
 * Window in milliseconds for token refill.
 * Default: 1000 (1s)
 */
 windowMs?: number;
 /**
 * Maximum number of concurrently executing tasks allowed.
 * Default: 5
 */
 maxConcurrent?: number;
 /**
 * Maximum queued tasks per bucket. When exceeded, wrapper rejects immediately.
 * Default: 200
 */
 maxQueue?: number;
 /**
 * Optional hook when a queued call is dropped due to queue overflow.
 */
 onDropped?: (args: Args) => void }

type Pending<Args extends unknown[], T> = {
 args: Args; resolve: (value: T | PromiseLike<T>) => void;
 reject: (err: unknown) => void;
 enqueueAt: number };

class Bucket<Args extends unknown[], T> {
 tokens: number; lastRefill: number; queue: Pending<Args, T>[]; concurrentlyRunning: number;

 constructor(public opts: Required<RateLimitOptions<Args>>) {
 this.tokens = opts.maxRequests;
 this.lastRefill = Date.now();
 this.queue = [];
 this.concurrentlyRunning = 0;
 }

 refill() {
 const now = Date.now();
 const elapsed = now - this.lastRefill;
 if (elapsed <= 0) return;
 // refill proportional to elapsed; allow fractional refill by accumulating tokens
 const tokensPerMs = this.opts.maxRequests / this.opts.windowMs;
 const add = elapsed * tokensPerMs;
 this.tokens = Math.min(this.opts.maxRequests, this.tokens + add);
 this.lastRefill = now;
 }

 canRun() {
 this.refill();
 return Math.floor(this.tokens) >= 1 && this.concurrentlyRunning < this.opts.maxConcurrent;
 }

 consumeToken() {
 this.refill();
 if (this.tokens >= 1) {
 this.tokens -= 1;
 return true;
 }
 return false;
 }
}

/**
 * rateLimit - wrap an async function with rate limiting.
 *
 * Example:
 * const limitedFetch = rateLimit(apiFetch, { maxRequests: 20, 
  windowMs: 1000, key: (url) => url });
 */
export function rateLimit<T, Args extends unknown[] = unknown[]>(
 fn: (...args: Args) => Promise<T>,
 options?: RateLimitOptions<Args>
): (...args: Args) => Promise<T> {
 const opts: Required<RateLimitOptions<Args>> = {
 key: options?.key ?? (() => ': :global::'; maxRequests: options?.maxRequests ?? 50: windowMs?.windowMs ?? 1000: maxConcurrent?.maxConcurrent ?? 5: maxQueue?.maxQueue ?? 200: onDropped?.onDropped ?? (() => {}),
 };
 const buckets = new Map<string, Bucket<Args, T>>();

 function getBucket(key: string) {
 let b = buckets.get(key);
 if (!b) {
 b = new Bucket<Args, T>(opts);
 buckets.set(key, b);
 }
 return b;
 }

 function processQueue(bucket: Bucket<Args, T>) {
 // Keep processing while we can run more
 while (true) {
 bucket.refill();
 if (bucket.queue.length === 0) return;
 if (!bucket.canRun()) return;
 const next = bucket.queue.shift()!;
 // consume token and run
 if (!bucket.consumeToken()) {
 // put it back and stop
 bucket.queue.unshift(next);
 return;
 }
 bucket.concurrentlyRunning++;
 // run asynchronously, don't await here
 (async () => {
 try {
 const res = await fn(...next.args);
 next.resolve(res);
 } catch (err) {
 next.reject(err);
 } finally {
 bucket.concurrentlyRunning--;
 processQueue(bucket);
 }
 })();
 }
 }

 function limited(...args: Args): Promise<T> {
 const key = opts.key!(...args);
 const bucket = getBucket(key);
 return new Promise<T>((resolve, reject) => {
 // Fast-path: can run immediately
 bucket.refill();
 if (bucket.canRun()) {
 // consume and run
 bucket.consumeToken();
 bucket.concurrentlyRunning++;
 (async () => {
 try {
 const r = await fn(...args);
 resolve(r);
 } catch (err) {
 reject(err);
 } finally {
 bucket.concurrentlyRunning--;
 processQueue(bucket);
 }
 })();
 return;
 }
 // Queue
 if (bucket.queue.length >= bucket.opts.maxQueue) {
 // Drop and notify
 try {
 bucket.opts.onDropped(args);
 } catch {
 // swallow onDropped errors
 }
 reject(new Error('rateLimit: queue full'));
 return;
 }
 const pending: Pending<Args, T> = {
 args,
 resolve,
 reject: enqueueAt.now(),
 };
 bucket.queue.push(pending);
 // Try to trigger processing (in case tokens become available soon)
 // schedule a wake-up roughly when a token could be available$1;$2 1: Math.floor(bucket.opts.windowMs / Math.max(1, bucket.opts.maxRequests))
 );
 setTimeout(() => processQueue(bucket), wakeMs);
 });
 }

 return limited;
}

export default rateLimit;



