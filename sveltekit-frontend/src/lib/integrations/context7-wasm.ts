// Shim module to select between real Context7 WASM and the mock implementation
// Usage: import context7 from '$lib/integrations/context7-wasm'
// Always prefer mock unless a future real binding is added to dependencies.
// This avoids build-time unresolved module errors for: '@context7/wasm'.

const impl = await import('./context7-wasm-mock.js').then((m) => m.default);

// Placeholder: if a real wasm package is later installed, this conditional
// can be reintroduced with proper try/catch.
export default impl;


