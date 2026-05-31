// Lightweight test-friendly CouchDB client shim
// Exports `couchdb` with async methods that are mockable in Vitest.

function createMockAsyncFn(name) {
  let next = [];
  const fn = async (...args) => {
    if (next.length > 0) {
      const { type, value } = next.shift();
      if (type === 'resolve') return value;
      if (type === 'reject') throw value;
    }
    // default no-op
    return null;
  };

  fn.mockResolvedValueOnce = (v) => { next.push({ type: 'resolve', value: v }); return fn; };
  fn.mockRejectedValueOnce = (e) => { next.push({ type: 'reject', value: e }); return fn; };
  fn.mockClear = () => { next = []; };
  fn.__mockQueue = () => next;
  return fn;
}

export const couchdb = {
  get: createMockAsyncFn('get'),
  put: createMockAsyncFn('put'),
  post: createMockAsyncFn('post'),
  delete: createMockAsyncFn('delete'),
  allDocs: createMockAsyncFn('allDocs'),
  view: createMockAsyncFn('view'),
  createDb: createMockAsyncFn('createDb'),
};

export default { couchdb };
