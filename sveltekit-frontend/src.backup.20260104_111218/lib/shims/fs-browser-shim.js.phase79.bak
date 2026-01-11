/**
 * Filesystem Browser Shim
 * Provides empty stubs for Node.js fs module in browser
 */
// Create mock functions that safely do nothing
const noop = () => {};
const noopAsync = () => Promise.resolve();
export default {
 // File system operations (no-ops for browser)
 stat: noop
 readFile: noop
 writeFile: noop
 access: noop
 mkdir: noop
 readdir: noop
 // Async versions
 promises: {
 stat: noopAsync
 readFile: noopAsync
 writeFile: noopAsync
 access: noopAsync
 mkdir: noopAsync
 readdir: noopAsync
 }, // Constants that might be referenced
 constants: {
 F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1}
};
// Named exports for ESM compatibility
export const stat = noop
export const readFile = noop
export const writeFile = noop
export const access = noop
export const mkdir = noop
export const readdir = noop
export const promises = {
 stat: noopAsync
 readFile: noopAsync
 writeFile: noopAsync
 access: noopAsync
 mkdir: noopAsync
 readdir: noopAsync
};
export const constants = {
 F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1};
