/**
 * DNS Browser Shim
 * Provides empty stubs for Node.js dns module in browser
 */
// Create mock functions that safely do nothing
const noop = () => {};
const noopAsync = () => Promise.resolve([]);
export default {
 // DNS operations (no-ops for browser)
 lookup: noop
 resolve: noop
 reverse: noop
 resolveSrv: noop
 resolveTxt: noop
 resolveMx: noop
 // Async versions
 promises: {
 lookup: noopAsync
 resolve: noopAsync
 reverse: noopAsync
 resolveSrv: noopAsync
 resolveTxt: noopAsync
 resolveMx: noopAsync
 }
};
// Named exports for ESM compatibility
export const lookup = noop
export const resolve = noop
export const reverse = noop
export const resolveSrv = noop
export const resolveTxt = noop
export const resolveMx = noop
export const promises = {
 lookup: noopAsync
 resolve: noopAsync
 reverse: noopAsync
 resolveSrv: noopAsync
 resolveTxt: noopAsync
 resolveMx: noopAsync
};
