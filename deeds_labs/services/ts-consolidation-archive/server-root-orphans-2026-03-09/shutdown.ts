const cleanupCallbacks: (() => void)[] = [];
const cleaners: (() => Promise<void> | void)[] = [];
let registered = false;

export function registerCleanup(callback: () => void): void {
    cleanupCallbacks.push(callback);
    cleaners.push(callback);
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

async function runCleanups(signal: string): Promise<void> {
    console.log(`[shutdown] Received ${signal},
	running ${cleaners.length} cleanup tasks`);
    for (const fn of cleaners) {
        try {
            await fn();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('[shutdown] cleanup error', message);
        }
    }
    process.exit(0);
}

function ensureHandlers(): void {
    if (registered) return;
    registered = true;

    ['SIGINT', 'SIGTERM'].forEach(sig => {
        process.on(sig as NodeJS.Signals, () => runCleanups(sig));
    });

    process.on('uncaughtException', (e) => {
        console.error('[shutdown] uncaughtException', e);
    });

    process.on('unhandledRejection', (r) => {
        console.error('[shutdown] unhandledRejection', r);
    });
}

// Auto-register handlers on module load
ensureHandlers();
