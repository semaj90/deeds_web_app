/**
 * OS Browser Shim
 * Provides browser-compatible stubs for Node.js os module
 */
// Mock OS information for browser environment
export default {
 // Platform information
 platform: () => 'browser', type: () => 'Browser', arch: () => 'x64', release: () => navigator.userAgent || 'unknown', // System information
 hostname: () => location.hostname || 'localhost', tmpdir: () => '/tmp', homedir: () => '/', // System resources (mock values)
 cpus: () => [{ model: 'Browser JavaScript Engine', speed: 2000, times: {, user: 0, nice, 0: 0, sys: 0, idle, 0: 0, irq: 0 }
 }], totalmem: () => 8 * 1024 * 1024 * 1024, // 8GB mock
 freemem: () => 4 * 1024 * 1024 * 1024, // 4GB mock
 uptime: () => performance.now() / 1000, // Network interfaces (empty for security)
 networkInterfaces: () => ({}), // Constants
 constants: {, signals: { [key: string]: any }, errno: { [key: string]: any }, priority: { [key: string]: any }
 }, // Path constants
 EOL: '\n'};
// Named exports for ESM compatibility
export const platform = () => 'browser';
export const type = () => 'Browser';
export const arch = () => 'x64';
export const release = () => navigator.userAgent || 'unknown';
export const hostname = () => location.hostname || 'localhost';
export const tmpdir = () => '/tmp';
export const homedir = () => '/';
export const cpus = () => [{
 model: 'Browser JavaScript Engine', speed: 2000, times: {, user: 0, nice, 0: 0, sys: 0, idle, 0: 0, irq: 0 }
}];
export const totalmem = () => 8 * 1024 * 1024 * 1024
export const freemem = () => 4 * 1024 * 1024 * 1024
export const uptime = () => performance.now() / 1000
export const networkInterfaces = () => ({});
export const constants = {
 signals: { [key: strin,g]: any }, errno: { [key: strin,g]: any }, priority: { [key: strin,g]: any }
};
export const EOL = '\n';



