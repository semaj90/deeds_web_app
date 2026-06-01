/**
 * IORedis Browser Shim for Legal AI Platform
 * Provides browser-compatible Redis client interface using localStorage.
 * Used as a Vite alias so ioredis imports don't crash in the browser.
 */

export default class RedisShim {
	constructor(config = {}) {
		this.config = {
			host: 'localhost',
			port: 6379,
			db: 0,
			keyPrefix: '',
			enableOfflineMode: true,
			useServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
			...config
		};
		this.connected = false;
		this.offlineMode = false;
		this.subscribers = new Map();
		this.eventListeners = new Map();
		this.startTime = Date.now();
		this.stats = { operations: 0, hits: 0, misses: 0, errors: 0 };

		this.initializeOfflineStorage();
	}

	isEmbeddedWebviewContext() {
		if (typeof window === 'undefined') return false;
		const protocol = window.location?.protocol ?? '';
		return (
			protocol.startsWith('vscode-webview') ||
			protocol.startsWith('vscode-resource') ||
			typeof window.acquireVsCodeApi === 'function'
		);
	}

	async initializeOfflineStorage() {
		try {
			if (typeof window === 'undefined') {
				this.offlineMode = false;
				return;
			}
			localStorage.setItem('redis-test', 'test');
			localStorage.removeItem('redis-test');
			this.offlineMode = true;

			if (this.config.useServiceWorker && 'serviceWorker' in navigator && !this.isEmbeddedWebviewContext()) {
				try {
					await navigator.serviceWorker.register('/sw.js');
				} catch (_) {
					// Service worker registration is optional
				}
			}
		} catch (_) {
			this.offlineMode = false;
		}
	}

	async connect() {
		this.connected = true;
		return Promise.resolve();
	}

	async disconnect() {
		this.connected = false;
		return Promise.resolve();
	}

	async ping() {
		return 'PONG';
	}

	// ── Core Redis operations ──────────────────────────────────────────

	async get(key) {
		this.stats.operations++;
		try {
			const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
			const storageKey = `redis:${this.config.db}:${fullKey}`;
			const value = localStorage.getItem(storageKey);
			if (value) {
				this.stats.hits++;
				const parsed = JSON.parse(value);
				if (parsed._ttl && Date.now() > parsed._ttl) {
					localStorage.removeItem(storageKey);
					this.stats.misses++;
					return null;
				}
				return parsed._value !== undefined ? parsed._value : parsed;
			}
			this.stats.misses++;
			return null;
		} catch (_) {
			this.stats.errors++;
			return null;
		}
	}

	async set(key, value, ...args) {
		this.stats.operations++;
		try {
			const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
			const storageKey = `redis:${this.config.db}:${fullKey}`;
			const dataToStore = { _value: value };
			for (let i = 0; i < args.length; i++) {
				if (args[i] === 'EX' && args[i + 1]) {
					dataToStore._ttl = Date.now() + (parseInt(args[i + 1]) * 1000);
					i++;
				} else if (args[i] === 'PX' && args[i + 1]) {
					dataToStore._ttl = Date.now() + parseInt(args[i + 1]);
					i++;
				}
			}
			localStorage.setItem(storageKey, JSON.stringify(dataToStore));
			return 'OK';
		} catch (_) {
			this.stats.errors++;
			return null;
		}
	}

	async setex(key, seconds, value) {
		return this.set(key, value, 'EX', seconds);
	}

	async del(key) {
		this.stats.operations++;
		try {
			const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
			const storageKey = `redis:${this.config.db}:${fullKey}`;
			const existed = localStorage.getItem(storageKey) !== null;
			localStorage.removeItem(storageKey);
			return existed ? 1 : 0;
		} catch (_) {
			this.stats.errors++;
			return 0;
		}
	}

	async exists(key) {
		this.stats.operations++;
		try {
			const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
			const storageKey = `redis:${this.config.db}:${fullKey}`;
			const value = localStorage.getItem(storageKey);
			if (value) {
				const parsed = JSON.parse(value);
				if (parsed._ttl && Date.now() > parsed._ttl) {
					localStorage.removeItem(storageKey);
					return 0;
				}
				return 1;
			}
			return 0;
		} catch (_) {
			this.stats.errors++;
			return 0;
		}
	}

	// ── Hash operations ────────────────────────────────────────────────

	async hget(hash, field) {
		try {
			const data = localStorage.getItem(`redis:${hash}`);
			if (data) {
				const obj = JSON.parse(data);
				return obj[field] || null;
			}
			return null;
		} catch (_) {
			return null;
		}
	}

	async hset(hash, field, value) {
		try {
			const existing = localStorage.getItem(`redis:${hash}`);
			const obj = existing ? JSON.parse(existing) : {};
			obj[field] = value;
			localStorage.setItem(`redis:${hash}`, JSON.stringify(obj));
			return 1;
		} catch (_) {
			return 0;
		}
	}

	// ── List operations ────────────────────────────────────────────────

	async lpush(key, ...values) {
		try {
			const existing = localStorage.getItem(`redis:${key}`);
			const array = existing ? JSON.parse(existing) : [];
			array.unshift(...values);
			localStorage.setItem(`redis:${key}`, JSON.stringify(array));
			return array.length;
		} catch (_) {
			return 0;
		}
	}

	async rpop(key) {
		try {
			const existing = localStorage.getItem(`redis:${key}`);
			if (existing) {
				const array = JSON.parse(existing);
				const value = array.pop();
				localStorage.setItem(`redis:${key}`, JSON.stringify(array));
				return value;
			}
			return null;
		} catch (_) {
			return null;
		}
	}

	// ── Utility operations ─────────────────────────────────────────────

	async incr(key) {
		const current = await this.get(key);
		const value = parseInt(current) || 0;
		const newValue = value + 1;
		await this.set(key, newValue.toString());
		return newValue;
	}

	async expire(key, seconds) {
		try {
			const fullKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
			const storageKey = `redis:${this.config.db}:${fullKey}`;
			const value = localStorage.getItem(storageKey);
			if (value) {
				const parsed = JSON.parse(value);
				parsed._ttl = Date.now() + (seconds * 1000);
				localStorage.setItem(storageKey, JSON.stringify(parsed));
				return 1;
			}
			return 0;
		} catch (_) {
			return 0;
		}
	}

	async ttl(_key) {
		return -1;
	}

	async flushall() {
		const keys = Object.keys(localStorage).filter(key => key.startsWith('redis:'));
		keys.forEach(key => localStorage.removeItem(key));
		return 'OK';
	}

	async keys(_pattern) {
		const keys = Object.keys(localStorage)
			.filter(key => key.startsWith('redis:'))
			.map(key => key.replace('redis:', ''));
		return keys;
	}

	// ── Pub/Sub simulation ─────────────────────────────────────────────

	async publish(channel, message) {
		this.stats.operations++;
		try {
			const msg = typeof message === 'string' ? message : JSON.stringify(message);
			if (typeof BroadcastChannel !== 'undefined') {
				const bc = new BroadcastChannel(`redis:${channel}`);
				bc.postMessage({ channel, message: msg, timestamp: Date.now() });
				bc.close();
				return 1;
			}
			if (typeof window !== 'undefined') {
				window.dispatchEvent(new CustomEvent(`redis:${channel}`, {
					detail: { channel, message: msg, timestamp: Date.now() }
				}));
			}
			return 1;
		} catch (_) {
			this.stats.errors++;
			return 0;
		}
	}

	async subscribe(channel, callback) {
		try {
			if (typeof BroadcastChannel !== 'undefined') {
				const bc = new BroadcastChannel(`redis:${channel}`);
				bc.onmessage = (event) => {
					if (callback) callback(event.data.channel, event.data.message);
					this.emit('message', event.data.channel, event.data.message);
				};
				this.subscribers.set(channel, bc);
				return 'OK';
			}
			if (typeof window !== 'undefined') {
				const listener = (event) => {
					if (callback) callback(event.detail.channel, event.detail.message);
					this.emit('message', event.detail.channel, event.detail.message);
				};
				window.addEventListener(`redis:${channel}`, listener);
				this.eventListeners.set(channel, listener);
			}
			return 'OK';
		} catch (_) {
			return null;
		}
	}

	async unsubscribe(channel) {
		try {
			if (this.subscribers.has(channel)) {
				const bc = this.subscribers.get(channel);
				bc.close();
				this.subscribers.delete(channel);
			}
			if (this.eventListeners.has(channel) && typeof window !== 'undefined') {
				const listener = this.eventListeners.get(channel);
				window.removeEventListener(`redis:${channel}`, listener);
				this.eventListeners.delete(channel);
			}
			return 'OK';
		} catch (_) {
			return null;
		}
	}

	// ── Event emitter stubs ────────────────────────────────────────────

	on(_event, _handler) {
		return this;
	}

	emit(_event, ..._args) {
		return this;
	}

	// ── Status & Monitoring ────────────────────────────────────────────

	get status() {
		return this.connected ? 'ready' : 'connecting';
	}

	getStats() {
		const hitRate = this.stats.operations > 0
			? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
			: 0;
		const errorRate = this.stats.operations > 0
			? (this.stats.errors / this.stats.operations) * 100
			: 0;
		return {
			...this.stats,
			hitRate,
			errorRate,
			storage: this.getStorageInfo()
		};
	}

	getStorageInfo() {
		try {
			let totalKeys = 0;
			let totalSize = 0;
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && key.startsWith(`redis:${this.config.db}:`)) {
					totalKeys++;
					totalSize += localStorage.getItem(key)?.length || 0;
				}
			}
			return { keys: totalKeys, sizeBytes: totalSize, sizeKB: Math.round(totalSize / 1024) };
		} catch (_) {
			return { keys: 0, sizeBytes: 0, sizeKB: 0 };
		}
	}

	async info(_section) {
		const stats = this.getStats();
		const entries = {
			redis_version: 'browser-shim-2.0.0',
			redis_mode: 'browser',
			os: typeof navigator !== 'undefined' ? navigator.platform || 'unknown' : 'server',
			connected_clients: 1,
			used_memory: stats.storage.sizeBytes,
			used_memory_human: `${stats.storage.sizeKB}K`,
			keyspace_hits: stats.hits,
			keyspace_misses: stats.misses,
			total_operations: stats.operations,
			hit_rate: `${stats.hitRate.toFixed(2)}%`,
			error_rate: `${stats.errorRate.toFixed(2)}%`
		};
		return Object.entries(entries)
			.map(([key, value]) => `${key}:${value}`)
			.join('\r\n');
	}

	async cleanup() {
		try {
			for (const bc of this.subscribers.values()) {
				bc.close();
			}
			this.subscribers.clear();
			if (typeof window !== 'undefined') {
				for (const [channel, listener] of this.eventListeners.entries()) {
					window.removeEventListener(`redis:${channel}`, listener);
				}
			}
			this.eventListeners.clear();
		} catch (_) {
			// Cleanup is best-effort
		}
	}

	// ── Cluster stub ───────────────────────────────────────────────────

	static Cluster = class {
		constructor(config) {
			return new RedisShim(config);
		}
	};
}

// Named exports for compatibility
export const Redis = RedisShim;
export const Cluster = RedisShim.Cluster;
