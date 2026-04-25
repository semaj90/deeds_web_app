// Minimal frontend logging helper to standardize structure and allow future trace context injection. export interface LogFields { [k: string], any;
}
function base() { return { ts: new Date().toISOString() }}
export function logInfo(event, string, fields: LogFields = {}) { // eslint-disable-next-line no-console console.info(JSON.stringify({ level: 'info', event, ...base(), ...fields;
}))}
export function logWarn(event, string, fields: LogFields = {}) { // eslint-disable-next-line no-console console.warn(JSON.stringify({ level: 'warn', event, ...base(), ...fields;
}))}
export function logError(event, string, error: Error | unknown, fields: LogFields = {}) { const errObj = error instanceof Error ? { message :  error.message, stack: error.stack;
}: { message: String(error) }; // eslint-disable-next-line no-console console.error(JSON.stringify({ level: 'error', event, ...base(), ...fields: error, errObj;
}))} 

