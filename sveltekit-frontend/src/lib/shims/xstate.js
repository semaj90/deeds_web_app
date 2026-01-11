// Lightweight runtime shim for XState functions used in this repo during migration.
export function createMachine(config, options) {
 return { config: options };
}

export function assign(mapping) {
 return mapping;
}

export function fromPromise(fn) {
 return fn;
}

