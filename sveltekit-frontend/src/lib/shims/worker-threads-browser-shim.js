/**
 * Browser shim for Node.js worker_threads module.
 * Required by onnxruntime-web's Emscripten-generated WASM loaders
 * which unconditionally attempt `import('worker_threads')` at module level.
 *
 * Provides class stubs so that `instanceof Worker` checks and
 * MessageChannel/MessagePort usage don't throw at import time.
 */

// EventTarget-like base for MessagePort
class MessagePortShim {
	constructor() {
		this._listeners = {};
	}

	postMessage(_data) {
		// no-op in browser shim — use native Web Workers instead
	}

	on(event, listener) {
		if (!this._listeners[event]) this._listeners[event] = [];
		this._listeners[event].push(listener);
		return this;
	}

	off(event, listener) {
		if (this._listeners[event]) {
			this._listeners[event] = this._listeners[event].filter((l) => l !== listener);
		}
		return this;
	}

	once(event, listener) {
		const wrapped = (...args) => {
			this.off(event, wrapped);
			listener(...args);
		};
		return this.on(event, wrapped);
	}

	removeAllListeners(event) {
		if (event) {
			delete this._listeners[event];
		} else {
			this._listeners = {};
		}
		return this;
	}

	ref() { return this; }
	unref() { return this; }
	start() {}
	close() {}
}

// MessageChannel stub (Node.js worker_threads.MessageChannel)
class MessageChannelShim {
	constructor() {
		this.port1 = new MessagePortShim();
		this.port2 = new MessagePortShim();
	}
}

// Worker class stub — not functional, but prevents instanceof/typeof crashes
class WorkerShim {
	constructor(_filename, _options) {
		this.threadId = 0;
		this.stdin = null;
		this.stdout = null;
		this.stderr = null;
		this.resourceLimits = {};
	}

	postMessage(_value) {}
	terminate() { return Promise.resolve(0); }
	ref() { return this; }
	unref() { return this; }

	on(event, listener) { return this; }
	off(event, listener) { return this; }
	once(event, listener) { return this; }
	removeAllListeners(_event) { return this; }
}

// BroadcastChannel stub (if not natively available)
class BroadcastChannelShim {
	constructor(_name) {
		this.name = _name;
	}
	postMessage(_msg) {}
	close() {}
	onmessage = null;
	onmessageerror = null;
}

// Core exports matching Node.js worker_threads API
export const Worker = WorkerShim;
export const MessageChannel = MessageChannelShim;
export const MessagePort = MessagePortShim;
export const BroadcastChannel = typeof globalThis.BroadcastChannel !== 'undefined'
	? globalThis.BroadcastChannel
	: BroadcastChannelShim;

export const isMainThread = true;
export const parentPort = null;
export const workerData = undefined;
export const threadId = 0;
export const resourceLimits = {};
export const SHARE_ENV = Symbol('SHARE_ENV');

export function markAsUntransferable(_obj) {}
export function moveMessagePortToContext(_port, _context) { return _port; }
export function receiveMessageOnPort(_port) { return undefined; }
export function getEnvironmentData(_key) { return undefined; }
export function setEnvironmentData(_key, _value) {}

export default {
	Worker: WorkerShim,
	MessageChannel: MessageChannelShim,
	MessagePort: MessagePortShim,
	BroadcastChannel,
	isMainThread,
	parentPort,
	workerData,
	threadId,
	resourceLimits,
	SHARE_ENV,
	markAsUntransferable,
	moveMessagePortToContext,
	receiveMessageOnPort,
	getEnvironmentData,
	setEnvironmentData,
};
