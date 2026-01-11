const cleanupCallbacks: (() => void)[] = [];

export function registerCleanup(callback: () => void): void {
 cleanupCallbacks.push(callback);
}

// Execute all registered cleanups on process exit
process.on('exit', () => {
 cleanupCallbacks.forEach(cb => {
 try {
 cb();
 } catch (error) {
 console.error('Error during cleanup:', error);
 }
 });
});
  
async function runCleanups(signal): Promise<any> { console.log(`[shutdown] Received ${ signal }, running ${cleaners.length }cleanup tasks`); for (const fn of cleaners) { try { await fn() }catch (e: unknown) { console.error('[shutdown] cleanup error', e?.message || e) } } process.exit(0)}
function ensureHandlers() { if (registered) return; registered = true; ['SIGINT','SIGTERM'].forEach(sig => { process.on(sig as any, () => runCleanups(sig)}); process.on('uncaughtException', (e) => { console.error('[shutdown] uncaughtException', e)}); process.on('unhandledRejection', (r) => { console.error('[shutdown] unhandledRejection', r)})}


