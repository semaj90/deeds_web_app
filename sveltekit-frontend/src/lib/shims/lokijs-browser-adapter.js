/**
 * LokiJS Browser-Compatible Adapter
 * Replaces filesystem operations with localStorage for persistence.
 * Falls back gracefully if localStorage is unavailable (e.g., private browsing quota exceeded).
 */

export class BrowserAdapter {
	constructor() {
		this.mode = 'normal';
	}

	/** Load database from localStorage instead of filesystem */
	loadDatabase(dbname, callback) {
		try {
			const data = localStorage.getItem(`loki:${dbname}`);
			if (data) {
				callback(data);
			} else {
				callback(null);
			}
		} catch (error) {
			console.warn('[LokiJS] Browser adapter load failed, using empty database:', error.message);
			callback(null);
		}
	}

	/** Save database to localStorage instead of filesystem */
	saveDatabase(dbname, dbstring, callback) {
		try {
			localStorage.setItem(`loki:${dbname}`, dbstring);
			if (callback) callback(null);
		} catch (error) {
			// localStorage quota exceeded or unavailable
			console.error('[LokiJS] Browser adapter save failed:', error.message);
			if (callback) callback(error);
		}
	}

	/** Delete database from localStorage */
	deleteDatabase(dbname, callback) {
		try {
			localStorage.removeItem(`loki:${dbname}`);
			if (callback) callback(null);
		} catch (error) {
			console.error('[LokiJS] Browser adapter delete failed:', error.message);
			if (callback) callback(error);
		}
	}
}

/** IndexedDB adapter for larger databases that exceed localStorage limits */
export class IndexedDBAdapter {
	constructor(dbPrefix = 'loki') {
		this.dbPrefix = dbPrefix;
	}

	loadDatabase(dbname, callback) {
		const request = indexedDB.open(`${this.dbPrefix}:${dbname}`, 1);

		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains('data')) {
				db.createObjectStore('data');
			}
		};

		request.onsuccess = (event) => {
			const db = event.target.result;
			try {
				const tx = db.transaction('data', 'readonly');
				const store = tx.objectStore('data');
				const getReq = store.get('serialized');

				getReq.onsuccess = () => {
					db.close();
					callback(getReq.result || null);
				};

				getReq.onerror = () => {
					db.close();
					callback(null);
				};
			} catch (err) {
				db.close();
				callback(null);
			}
		};

		request.onerror = () => {
			callback(null);
		};
	}

	saveDatabase(dbname, dbstring, callback) {
		const request = indexedDB.open(`${this.dbPrefix}:${dbname}`, 1);

		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains('data')) {
				db.createObjectStore('data');
			}
		};

		request.onsuccess = (event) => {
			const db = event.target.result;
			try {
				const tx = db.transaction('data', 'readwrite');
				const store = tx.objectStore('data');
				store.put(dbstring, 'serialized');

				tx.oncomplete = () => {
					db.close();
					if (callback) callback(null);
				};

				tx.onerror = (err) => {
					db.close();
					if (callback) callback(err);
				};
			} catch (err) {
				db.close();
				if (callback) callback(err);
			}
		};

		request.onerror = (err) => {
			if (callback) callback(err);
		};
	}

	deleteDatabase(dbname, callback) {
		const request = indexedDB.deleteDatabase(`${this.dbPrefix}:${dbname}`);
		request.onsuccess = () => { if (callback) callback(null); };
		request.onerror = (err) => { if (callback) callback(err); };
	}
}

// Browser-compatible LokiJS configuration (localStorage, small DBs)
export const browserLokiConfig = {
	adapter: new BrowserAdapter(),
	autoload: true,
	autoloadCallback: function () {
		console.log('[LokiJS] Database loaded successfully');
	},
	autosave: true,
	autosaveInterval: 4000,
	persistenceMethod: 'localStorage',
};

// IndexedDB-backed config (for larger datasets)
export const indexedDBLokiConfig = {
	adapter: new IndexedDBAdapter(),
	autoload: true,
	autoloadCallback: function () {
		console.log('[LokiJS] IndexedDB database loaded successfully');
	},
	autosave: true,
	autosaveInterval: 5000,
	persistenceMethod: 'adapter',
};

export default BrowserAdapter;
