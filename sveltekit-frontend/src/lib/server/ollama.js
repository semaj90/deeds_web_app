// Compatibility shim: re-export TypeScript implementation for .js imports
import * as impl from './ollama.ts';

function createMockableWrapper(orig) {
  if (typeof orig !== 'function') return orig;
  let next = [];
  const wrapper = async function (...args) {
    if (next.length > 0) {
      const { type, value } = next.shift();
      if (type === 'resolve') return value;
      if (type === 'reject') throw value;
    }
    return await orig.apply(this, args);
  };
  wrapper.mockResolvedValueOnce = (v) => {
    next.push({ type: 'resolve', value: v });
    return wrapper;
  };
  wrapper.mockRejectedValueOnce = (e) => {
    next.push({ type: 'reject', value: e });
    return wrapper;
  };
  wrapper.mockClear = () => {
    next = [];
  };
  wrapper.__mockQueue = () => next;
  return wrapper;
}

// Export the mockable wrapper for ollamaFetch; also export default underlying impl
export const ollamaFetch = createMockableWrapper(impl.ollamaFetch);

export * from './ollama.ts';
export default impl;

