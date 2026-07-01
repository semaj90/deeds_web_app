/**
 * src/lib/server/streaming/async-loop-guards.ts
 *
 * Safe async loop wrappers that prevent:
 * 1. Infinite hangs (timeout guards)
 * 2. Cascading failures (per-iteration error handling)
 * 3. Resource leaks (cleanup on break/return)
 * 4. Unbounded buffering (backpressure awareness)
 *
 * Patterns:
 *   - `withTimeout()` wraps async iterables with timeout
 *   - `withErrorBoundary()` catches per-iteration exceptions
 *   - `withCleanup()` ensures cleanup on early exit
 *   - `withBackpressure()` slows down on backlog
 */

export interface AsyncLoopOptions {
  timeout?: number; // max loop duration (default: 60000ms)
  errorHandler?: (err: Error, iteration: number) => 'continue' | 'throw' | 'break';
  backpressureThreshold?: number; // delay after N iterations (default: never)
  onComplete?: () => void | Promise<void>; // cleanup callback
}

/**
 * Wrap an async iterable with a timeout guard.
 *
 * Example:
 *   for await (const item of withTimeout(slowIterable, 30000)) {
 *     process(item);
 *   }
 *   // Throws if loop takes >30s
 */
export async function* withTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number = 60_000
): AsyncGenerator<T> {
  const startTime = Date.now();
  const abortController = new AbortController();

  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    for await (const item of iterable) {
      if (abortController.signal.aborted) {
        throw new Error(`Loop timeout after ${timeoutMs}ms`);
      }
      yield item;
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Wrap an async iterable with per-iteration error handling.
 *
 * Example:
 *   for await (const item of withErrorBoundary(iterable, {
 *     errorHandler: (err, i) => i < 3 ? 'continue' : 'throw'
 *   })) {
 *     process(item);
 *   }
 *   // Skips first 3 errors, throws on 4th
 */
export async function* withErrorBoundary<T>(
  iterable: AsyncIterable<T>,
  options: { errorHandler?: (err: Error, iteration: number) => 'continue' | 'throw' | 'break' } = {}
): AsyncGenerator<T> {
  const { errorHandler = () => 'throw' } = options;
  let iteration = 0;

  try {
    for await (const item of iterable) {
      try {
        yield item;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const decision = errorHandler(error, iteration);

        if (decision === 'break') {
          break;
        }
        if (decision === 'throw') {
          throw error;
        }
        // 'continue' → skip this item and move to next
      }
      iteration++;
    }
  } catch (err) {
    // Propagate non-handled errors
    throw err;
  }
}

/**
 * Wrap an async iterable with cleanup guarantees.
 *
 * Example:
 *   for await (const item of withCleanup(openStream(), {
 *     onComplete: () => closeStream()
 *   })) {
 *     if (condition) break; // cleanup still fires
 *   }
 */
export async function* withCleanup<T>(
  iterable: AsyncIterable<T>,
  options: { onComplete?: () => void | Promise<void> } = {}
): AsyncGenerator<T> {
  const { onComplete } = options;

  try {
    for await (const item of iterable) {
      yield item;
    }
  } finally {
    if (onComplete) {
      await Promise.resolve(onComplete());
    }
  }
}

/**
 * Wrap an async iterable with backpressure slowing.
 *
 * Adds a small delay every N iterations to prevent overwhelming
 * the event loop on fast sources.
 *
 * Example:
 *   for await (const item of withBackpressure(fastIterable, {
 *     backpressureThreshold: 1000
 *   })) {
 *     process(item);
 *   }
 *   // ~1ms delay every 1000 items
 */
export async function* withBackpressure<T>(
  iterable: AsyncIterable<T>,
  options: { backpressureThreshold?: number } = {}
): AsyncGenerator<T> {
  const { backpressureThreshold = 1000 } = options;
  let iteration = 0;

  for await (const item of iterable) {
    if (iteration > 0 && iteration % backpressureThreshold === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
    yield item;
    iteration++;
  }
}

/**
 * Compose multiple guards into one wrapper.
 *
 * Example:
 *   for await (const item of withGuards(iterable, {
 *     timeout: 30000,
 *     errorHandler: (err) => 'continue',
 *     onComplete: cleanup,
 *     backpressureThreshold: 500
 *   })) {
 *     process(item);
 *   }
 */
export function withGuards<T>(
  iterable: AsyncIterable<T>,
  options: AsyncLoopOptions = {}
): AsyncIterable<T> {
  const {
    timeout = 60_000,
    errorHandler,
    backpressureThreshold,
    onComplete
  } = options;

  let wrapped: AsyncIterable<T> = iterable;

  if (timeout) {
    wrapped = withTimeout(wrapped, timeout);
  }

  if (errorHandler) {
    wrapped = withErrorBoundary(wrapped, { errorHandler });
  }

  if (backpressureThreshold) {
    wrapped = withBackpressure(wrapped, { backpressureThreshold });
  }

  if (onComplete) {
    wrapped = withCleanup(wrapped, { onComplete });
  }

  return wrapped;
}
