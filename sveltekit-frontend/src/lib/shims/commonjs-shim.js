/**
 * Lightweight CommonJS compatibility shim for browser builds.
 *
 * Some legacy dependencies perform feature detection like `if (typeof module !== 'undefined')`.
 * Instead of unsafe define() injections in Vite, we expose minimal stand-ins when imported explicitly.
 *
 * Usage in app entry (only if a lib actually needs it): import 'cjs-shim'
 */

if (typeof globalThis.global === 'undefined') {
	// Align with Node-style global expectation
	globalThis.global = globalThis;
}

// Only define `module` / `exports` if they are truly absent
// (avoid clobbering real ESM environments like SSR adaptors)
if (typeof globalThis.module === 'undefined') {
	globalThis.module = { exports: {} };
}

if (typeof globalThis.exports === 'undefined') {
	globalThis.exports = globalThis.module.exports;
}

// Provide a noop require to satisfy very shallow guards
// (should not be used for real resolution)
if (typeof globalThis.require === 'undefined') {
	globalThis.require = function noopRequire(id) {
		throw new Error(
			'CommonJS require shim invoked for "' + id + '" — convert this dependency to ESM or provide an explicit browser build.'
		);
	};
}

export {};