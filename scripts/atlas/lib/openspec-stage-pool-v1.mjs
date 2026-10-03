export async function runBoundedStagePool(items, maxConcurrency, worker) {
  if (!Array.isArray(items)) throw new TypeError('STAGE_POOL_ITEMS_MUST_BE_ARRAY');
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError('STAGE_POOL_CONCURRENCY_MUST_BE_POSITIVE_INTEGER');
  }
  if (typeof worker !== 'function') throw new TypeError('STAGE_POOL_WORKER_MUST_BE_FUNCTION');

  const results = new Array(items.length);
  let nextIndex = 0;
  let firstError = null;
  const workerCount = Math.min(maxConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!firstError) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  }));
  if (firstError) throw firstError;
  return results;
}
